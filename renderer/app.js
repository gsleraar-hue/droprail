'use strict';

const rail = document.getElementById('rail');
const hint = document.getElementById('hint');
const last = document.getElementById('last');
const thumb = document.getElementById('thumb');
const kind = document.getElementById('kind');
const folder = document.getElementById('folder');
const cog = document.getElementById('cog');

const IDLE = 'Drop here';
let dragDepth = 0;
let resetTimer = null;
// What the last catch looks like; comes from the settings.
let preview = 'type';
let lastResult = null;

function setState(cls, text, holdMs) {
  rail.classList.remove('busy', 'done', 'failed');
  if (cls) rail.classList.add(cls);
  hint.textContent = text;
  clearTimeout(resetTimer);
  if (holdMs) {
    resetTimer = setTimeout(() => {
      rail.classList.remove('busy', 'done', 'failed');
      hint.textContent = IDLE;
    }, holdMs);
  }
}

// ---------------------------------------------------------------- dragging

function over(on) {
  rail.classList.toggle('over', on);
  if (on) {
    clearTimeout(resetTimer);
    rail.classList.remove('done', 'failed');
    hint.textContent = 'Let go';
  } else if (!rail.classList.contains('busy')) {
    hint.textContent = IDLE;
  }
}

window.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragDepth++;
  over(true);
});

window.addEventListener('dragover', (e) => {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
});

window.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) over(false);
});

window.addEventListener('drop', onDrop);

async function onDrop(e) {
  e.preventDefault();
  dragDepth = 0;
  over(false);

  const dt = e.dataTransfer;
  if (!dt) return;

  // getData only works while the drop handler runs synchronously, so read
  // everything first and wait for the saving afterwards.
  const text = {
    html: dt.getData('text/html'),
    uriList: dt.getData('text/uri-list'),
    text: dt.getData('text/plain'),
  };
  const files = dt.files ? Array.from(dt.files) : [];

  const jobs = [];
  for (const file of files) {
    const filePath = window.droprail.pathForFile(file);
    jobs.push(filePath ? { filePath } : { file, fileName: file.name });
  }
  if (!jobs.length) jobs.push(text);

  setState('busy', jobs.length > 1 ? `${jobs.length} items...` : 'Saving...');

  let saved = 0;
  let latest = null;
  let error = '';

  for (const job of jobs) {
    const payload = { ...job };
    if (payload.file) {
      payload.bytes = await payload.file.arrayBuffer();
      delete payload.file;
    }
    const res = await window.droprail.drop(payload);
    if (res && res.ok) {
      saved++;
      latest = res;
    } else if (!error) {
      error = (res && res.error) || 'Failed';
    }
  }

  if (latest) showLast(latest);

  if (saved && !error) {
    setState('done', saved > 1 ? `${saved} saved` : 'Saved', 2200);
  } else if (saved && error) {
    setState('failed', `${saved} of ${jobs.length}`, 3200);
  } else {
    setState('failed', error, 3600);
  }
}

// ---------------------------------------------------------------- buttons

function showLast(res) {
  lastResult = res;
  last.title = res.name || '';
  last.dataset.file = res.file || '';

  if (preview === 'off') {
    last.hidden = true;
    return;
  }

  const useThumb = preview === 'thumb' && res.thumb;
  if (useThumb) {
    thumb.src = res.thumb;
  } else {
    thumb.removeAttribute('src');
    kind.textContent = res.ext || 'IMG';
    kind.dataset.ext = (res.ext || '').toLowerCase();
  }
  thumb.hidden = !useThumb;
  kind.hidden = useThumb;
  last.hidden = false;
}

last.addEventListener('click', () => {
  if (last.dataset.file) window.droprail.reveal(last.dataset.file);
});

folder.addEventListener('click', () => window.droprail.openDir());
cog.addEventListener('click', () => window.droprail.settings());

window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.droprail.menu();
});

// ---------------------------------------------------------------- start

function applyState(state) {
  if (!state) return;
  if (state.dir) folder.title = `Open folder: ${state.dir}`;
  if (state.preview) {
    preview = state.preview;
    // Switch over right away, even with something already in the rail. We no
    // longer have a thumbnail of an earlier catch, so that stays a badge.
    if (lastResult) showLast(lastResult);
    else if (preview === 'off') last.hidden = true;
  }
  // The idle opacity comes from the settings; hovering and dragging turn the
  // rail fully opaque in CSS anyway.
  document.documentElement.style.setProperty('--rest', String(state.rest || 0.6));
}

window.droprail.state().then(applyState);
window.droprail.onState(applyState);
