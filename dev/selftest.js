'use strict';

// Test for catcher.js: runs the four kinds of drag data through the saving
// logic and prints what lands on disk. No window, so it runs in a terminal:
// npm run selftest
// The download case needs the internet; offline, only that one fails.

const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const catcher = require('../catcher');

const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'droprail-test-'));
catcher.setTargetDir(() => OUT);

// A 1x1 red PNG.
const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const REMOTE =
  'https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png';

const CASES = [
  {
    name: 'data URL (dragged as text)',
    payload: { text: PNG_DATA_URL },
  },
  {
    name: 'HTML fragment from a browser',
    payload: {
      html: `<meta charset='utf-8'><img src="${REMOTE}?a=1&amp;b=2" alt="demo">`,
      uriList: 'https://commons.wikimedia.org/wiki/File:PNG_transparency_demonstration_1.png',
    },
  },
  {
    name: 'loose bytes (browser without a path)',
    payload: null, // filled in below
  },
  {
    name: 'file from disk',
    payload: null, // filled in below
  },
  {
    name: 'anything but an image must be refused',
    payload: { text: 'https://example.com/' },
    shouldFail: true,
  },
];

async function run() {
  const png = Buffer.from(PNG_DATA_URL.split(',')[1], 'base64');
  const bytes = () => png.buffer.slice(png.byteOffset, png.byteOffset + png.length);
  CASES[2].payload = { bytes: bytes(), fileName: 'from browser.png' };

  const onDisk = path.join(OUT, '..', 'droprail-source.png');
  fs.writeFileSync(onDisk, png);
  CASES[3].payload = { filePath: onDisk };

  let failures = 0;

  for (const c of CASES) {
    try {
      const res = await catcher.handleDrop(c.payload);
      const size = fs.statSync(res.file).size;
      const ok = !c.shouldFail && size > 0;
      if (!ok) failures++;
      console.log(
        `${ok ? 'OK  ' : 'FAIL'} ${c.name} -> ${path.basename(res.file)} (${size} bytes, ${
          res.thumb ? `thumbnail ${res.thumb.length} chars` : 'no thumbnail'
        })`
      );
    } catch (err) {
      const ok = !!c.shouldFail;
      if (!ok) failures++;
      console.log(`${ok ? 'OK  ' : 'FAIL'} ${c.name} -> refused: ${err.message}`);
    }
  }

  // The same name twice must not overwrite anything.
  await catcher.handleDrop({ bytes: bytes(), fileName: 'from browser.png' });
  const names = fs.readdirSync(OUT);
  const doubles = names.filter((n) => n.startsWith('from browser'));
  const okDoubles = doubles.length === 2;
  if (!okDoubles) failures++;
  console.log(`${okDoubles ? 'OK  ' : 'FAIL'} duplicate name -> ${doubles.join(', ')}`);

  // With the rail set to a type badge no thumbnail should be produced; that
  // saves work on every drop.
  catcher.setThumbnails(() => false);
  const without = await catcher.handleDrop({ text: PNG_DATA_URL });
  const okWithout = without.thumb === '';
  if (!okWithout) failures++;
  console.log(`${okWithout ? 'OK  ' : 'FAIL'} without thumbnail -> thumb "${without.thumb}"`);
  catcher.setThumbnails(() => true);

  console.log('\nfolder:', OUT);
  console.log('contents:', fs.readdirSync(OUT).join(' | '));
  console.log(failures ? `\n${failures} test(s) failed` : '\nall good');
  app.exit(failures ? 1 : 0);
}

app.whenReady().then(run);
