'use strict';

const dirEl = document.getElementById('dir');
const onTop = document.getElementById('onTop');
const shown = document.getElementById('shown');
const shownHint = document.getElementById('shownHint');
const offExternal = document.getElementById('offExternal');
const externalHint = document.getElementById('externalHint');
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
  offExternal.checked = !!state.offExternal;
  autostart.checked = !!state.autostart;
  // Say what the rule is doing right now, rather than leaving you to work out
  // whether this machine counts as having an external screen.
  externalHint.textContent = state.external
    ? 'An external screen is connected right now.'
    : 'The rail switches itself off while a second screen is connected.';
  rest.value = Math.round((state.rest || 0.6) * 100);
  restValue.textContent = `${rest.value}%`;
  // macOS has no system tray; the same icon lives in the menu bar there.
  const icon = state.platform === 'darwin' ? 'menu bar icon' : 'tray icon';
  shownHint.textContent =
    state.offExternal && state.external
      ? `An external screen is keeping it off; the ${icon} stays.`
      : `Off leaves only the ${icon}.`;
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
offExternal.addEventListener('change', () => set('offExternal', offExternal.checked));
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
document.getElementById('quit').addEventListener('click', () => window.droprail.quit());
document.getElementById('close').addEventListener('click', () => window.close());

window.droprail.state().then(apply);
window.droprail.onState(apply);
