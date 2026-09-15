'use strict';

// Draws the Droprail icon (an arrow falling into a gutter) and writes
// build/icon.ico, build/icon.png and build/icon.icns. All by hand: a PNG
// encoder on top of zlib, with an ICO and an ICNS container around it, so no
// extra packages are needed on any platform.
// Run with: npm run icon

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZES = [16, 24, 32, 48, 64, 128, 256];
const SUB = 4; // 4x4 subsamples per pixel for smooth edges

// ---------------------------------------------------------------- shapes
// Everything in unit coordinates (0..1), signed distances: <= 0 is inside.

function sdRoundedBox(px, py, hw, hh, r) {
  const qx = Math.abs(px - 0.5) - (hw - r);
  const qy = Math.abs(py - 0.5) - (hh - r);
  return (
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
  );
}

function sdCapsule(px, py, ax, ay, bx, by, r) {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const len2 = bax * bax + bay * bay;
  let h = len2 === 0 ? 0 : (pax * bax + pay * bay) / len2;
  h = h < 0 ? 0 : h > 1 ? 1 : h;
  return Math.hypot(pax - bax * h, pay - bay * h) - r;
}

function mix(a, b, t) {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ];
}

const BG_TOP = [37, 46, 58];
const BG_BOTTOM = [18, 22, 28];
const MARK_TOP = [150, 245, 216];
const MARK_BOTTOM = [45, 199, 163];

// ---------------------------------------------------------------- drawing

function render(size) {
  const rgba = Buffer.alloc(size * size * 4);

  // Below 32px the gutter closes in on the arrow; there we draw a shorter
  // arrow with more air underneath it.
  const small = size <= 24;

  const stroke = Math.max(0.085, 2 / size);
  const r = stroke / 2;

  const stemTop = small ? 0.24 : 0.2;
  const stemBottom = small ? 0.5 : 0.53;
  const headSpan = small ? 0.15 : 0.17;

  // The gutter: a U of three capsules, open at the top.
  const gutterY = small ? 0.78 : 0.79;
  const gutterX = small ? 0.2 : 0.185;
  const gutterTop = small ? 0.62 : 0.63;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let ar = 0;
      let ag = 0;
      let ab = 0;
      let aa = 0;

      for (let sy = 0; sy < SUB; sy++) {
        for (let sx = 0; sx < SUB; sx++) {
          const px = (x + (sx + 0.5) / SUB) / size;
          const py = (y + (sy + 0.5) / SUB) / size;

          if (sdRoundedBox(px, py, 0.5, 0.5, 0.215) > 0) continue;

          const inMark =
            Math.min(
              // arrow pointing down
              sdCapsule(px, py, 0.5, stemTop, 0.5, stemBottom, r),
              sdCapsule(px, py, 0.5 - headSpan, stemBottom - headSpan, 0.5, stemBottom, r),
              sdCapsule(px, py, 0.5 + headSpan, stemBottom - headSpan, 0.5, stemBottom, r),
              // gutter
              sdCapsule(px, py, gutterX, gutterTop, gutterX, gutterY, r),
              sdCapsule(px, py, 1 - gutterX, gutterTop, 1 - gutterX, gutterY, r),
              sdCapsule(px, py, gutterX, gutterY, 1 - gutterX, gutterY, r)
            ) <= 0;

          const c = inMark
            ? mix(MARK_TOP, MARK_BOTTOM, (py - 0.15) / 0.7)
            : mix(BG_TOP, BG_BOTTOM, py);

          ar += c[0];
          ag += c[1];
          ab += c[2];
          aa += 1;
        }
      }

      const total = SUB * SUB;
      const i = (y * size + x) * 4;
      if (aa === 0) continue;
      rgba[i] = Math.round(ar / aa);
      rgba[i + 1] = Math.round(ag / aa);
      rgba[i + 2] = Math.round(ab / aa);
      rgba[i + 3] = Math.round((aa / total) * 255);
    }
  }

  return rgba;
}

// ---------------------------------------------------------------- png

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter type 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- ico (Windows)

function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(images.length, 4);

  const entries = Buffer.alloc(16 * images.length);
  let offset = 6 + 16 * images.length;

  images.forEach((img, i) => {
    const e = 16 * i;
    entries[e] = img.size >= 256 ? 0 : img.size; // 0 means 256
    entries[e + 1] = img.size >= 256 ? 0 : img.size;
    entries.writeUInt16LE(1, e + 4); // colour planes
    entries.writeUInt16LE(32, e + 6); // bits per pixel
    entries.writeUInt32LE(img.png.length, e + 8);
    entries.writeUInt32LE(offset, e + 12);
    offset += img.png.length;
  });

  return Buffer.concat([header, entries, ...images.map((i) => i.png)]);
}

// ---------------------------------------------------------------- icns (macOS)
//
// An .icns is a box of images just like an .ico, only laid out differently:
// four letters as the type, then the length, then a PNG. That way the Mac icon
// needs no extra tooling either.

const ICNS_TYPES = [
  ['icp4', 16],
  ['icp5', 32],
  ['ic11', 32], // 16 on a double-density screen
  ['ic12', 64], // 32 likewise
  ['ic07', 128],
  ['ic13', 256], // 128 likewise
  ['ic08', 256],
  ['ic14', 512], // 256 likewise
  ['ic09', 512],
  ['ic10', 1024], // 512 likewise
];

function buildIcns(pngOf) {
  const parts = [];
  for (const [kind, size] of ICNS_TYPES) {
    const png = pngOf(size);
    const head = Buffer.alloc(8);
    head.write(kind, 0, 4, 'ascii');
    head.writeUInt32BE(png.length + 8, 4);
    parts.push(head, png);
  }
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.write('icns', 0, 4, 'ascii');
  head.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([head, body]);
}

// ---------------------------------------------------------------- writing

const outDir = path.join(__dirname, '..', 'build');
fs.mkdirSync(outDir, { recursive: true });

const drawn = new Map();
const pngOf = (size) => {
  if (!drawn.has(size)) drawn.set(size, encodePng(size, render(size)));
  return drawn.get(size);
};

fs.writeFileSync(
  path.join(outDir, 'icon.ico'),
  buildIco(SIZES.map((size) => ({ size, png: pngOf(size) })))
);

// electron-builder wants at least 512x512 for macOS, and the tray shrinks this
// one down itself.
fs.writeFileSync(path.join(outDir, 'icon.png'), pngOf(512));

// Every size gets drawn here, so this one takes a moment.
fs.writeFileSync(path.join(outDir, 'icon.icns'), buildIcns(pngOf));

console.log('wrote build/icon.ico, build/icon.png and build/icon.icns');
