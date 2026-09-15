'use strict';

const dirEl = document.getElementById('dir');
const onTop = document.getElementById('onTop');
const shown = document.getElementById('shown');
const shownHint = document.getElementById('shownHint');
const autostart = document.getElementById('autostart');
const sideBox = document.getElementById('side');
const previewBox = document.getElementById('preview');
const rest = document.getElementById('rest');
const restValue = document.getElementById('restValue');

// While we push incoming state into the controls, the change handlers must not
// write back; that would be a loop.
let applying = false;

function apply(state) {
  if (!state) return;
  applying = true;
  dirEl.textContent = state.dir || '';
  onTop.checked = !!state.onTop;
  shown.checked = !state.hidden;
  autostart.checked = !!state.autostart;
  rest.value = Math.round((state.rest || 0.6) * 100);
  restValue.textContent = `${rest.value}%`;
  // macOS has no system tray; the same icon lives in the menu bar there.
  shownHint.textContent =
    state.platform === 'darwin'
      ? 'Off leaves only the menu bar icon.'
      : 'Off leaves only the tray icon.';
  for (const b of sideBox.querySelectorAll('button')) {
    b.classList.toggle('on', b.dataset.side === state.side);
  }
  for (const b of previewBox.querySelectorAll('button')) {
    b.classList.toggle('on', b.dataset.preview === (state.preview || 'type'));
  }
  applying = false;
}

function set(key, value) {
  if (applying) return;
  window.droprail.set(key, value).then(apply);
}

onTop.addEventListener('change', () => set('onTop', onTop.checked));
shown.addEventListener('change', () => set('hidden', !shown.checked));
autostart.addEventListener('change', () => set('autostart', autostart.checked));

rest.addEventListener('input', () => {
  restValue.textContent = `${rest.value}%`;
  set('rest', Number(rest.value) / 100);
});

sideBox.addEventListener('click', (e) => {
  const button = e.target.closest('button[data-side]');
  if (button) set('side', button.dataset.side);
});

previewBox.addEventListener('click', (e) => {
  const button = e.target.closest('button[data-preview]');
  if (button) set('preview', button.dataset.preview);
});

document.getElementById('pick').addEventListener('click', async () => {
  const dir = await window.droprail.pickDir();
  if (dir) dirEl.textContent = dir;
});

document.getElementById('open').addEventListener('click', () => window.droprail.openDir());
document.getElementById('close').addEventListener('click', () => window.close());

window.droprail.state().then(apply);
window.droprail.onState(apply);
