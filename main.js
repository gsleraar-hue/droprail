'use strict';

const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  ipcMain,
  dialog,
  shell,
  screen,
  nativeImage,
} = require('electron');
const path = require('path');
const fs = require('fs');
const catcher = require('./catcher');

const RAIL_W = 88;
const RAIL_H = 268;
const EDGE_GAP = 10; // distance to the screen edge

const MAC = process.platform === 'darwin';
const WINDOWS = process.platform === 'win32';

// Windows wants an .ico for the window and the executable; everywhere else a
// PNG is the safer bet, and the tray looks crisper with one on every platform.
const ICON = path.join(__dirname, 'build', WINDOWS ? 'icon.ico' : 'icon.png');
const TRAY_ICON = path.join(__dirname, 'build', 'icon.png');

let win = null;
let settingsWin = null;
let tray = null;
let moveTimer = null;

// ---------------------------------------------------------------- settings

const CONFIG_FILE = () => path.join(app.getPath('userData'), 'config.json');

function defaultDir() {
  return path.join(app.getPath('pictures'), 'Droprail');
}

// The slider in the settings window moves in steps of 5%; snapping here keeps
// the window from showing 60% while 62% is what got stored.
function snapRest(value) {
  const v = Math.min(Math.max(Number(value) || 0.6, 0.15), 1);
  return Math.round(v * 20) / 20;
}

// This app was called Vangrail before it spoke English, and userData hangs off
// the product name. Without this, the folder you picked silently resets.
function adoptOldConfig() {
  const current = CONFIG_FILE();
  if (fs.existsSync(current)) return;
  const older = path.join(path.dirname(app.getPath('userData')), 'Vangrail', 'config.json');
  try {
    if (!fs.existsSync(older)) return;
    fs.mkdirSync(path.dirname(current), { recursive: true });
    fs.copyFileSync(older, current);
    console.log('adopted the settings from the previous name');
  } catch (err) {
    console.error('could not adopt the old settings:', err.message);
  }
}

function loadConfig() {
  let saved = {};
  try {
    saved = JSON.parse(fs.readFileSync(CONFIG_FILE(), 'utf8'));
  } catch (_) {
    // first run or a broken file: defaults
  }
  return {
    dir: typeof saved.dir === 'string' && saved.dir ? saved.dir : defaultDir(),
    side: saved.side === 'left' ? 'left' : 'right',
    y: Number.isFinite(saved.y) ? saved.y : null,
    display: Number.isFinite(saved.display) ? saved.display : null,
    onTop: saved.onTop !== false,
    // How visible the rail is while you are not using it.
    rest: Number.isFinite(saved.rest) ? snapRest(saved.rest) : 0.6,
    hidden: saved.hidden === true,
    // What the rail shows of the last catch: 'type' (extension badge),
    // 'thumb' (thumbnail) or 'off' (nothing).
    preview: ['type', 'thumb', 'off'].includes(saved.preview) ? saved.preview : 'type',
  };
}

function saveConfig(patch) {
  const next = { ...loadConfig(), ...patch };
  try {
    fs.mkdirSync(path.dirname(CONFIG_FILE()), { recursive: true });
    fs.writeFileSync(CONFIG_FILE(), JSON.stringify(next, null, 2));
  } catch (err) {
    console.error('settings not saved:', err.message);
  }
  return next;
}

function targetDir() {
  const dir = loadConfig().dir;
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

catcher.setTargetDir(targetDir);
catcher.setThumbnails(() => loadConfig().preview === 'thumb');

// Both windows listen to the same state, so a change in the settings window
// shows up in the rail right away.
function broadcast() {
  const cfg = loadConfig();
  const payload = {
    dir: cfg.dir,
    side: cfg.side,
    onTop: cfg.onTop,
    rest: cfg.rest,
    hidden: cfg.hidden,
    preview: cfg.preview,
    autostart: app.getLoginItemSettings().openAtLogin,
    platform: process.platform,
  };
  for (const w of [win, settingsWin]) {
    if (w && !w.isDestroyed()) w.webContents.send('state', payload);
  }
  return payload;
}

function applyConfig() {
  const cfg = loadConfig();
  if (win && !win.isDestroyed()) {
    win.setAlwaysOnTop(cfg.onTop, 'screen-saver');
    const pos = placement(cfg);
    win.setBounds({ x: pos.x, y: pos.y, width: RAIL_W, height: RAIL_H });
    if (cfg.hidden && win.isVisible()) win.hide();
    if (!cfg.hidden && !win.isVisible()) win.showInactive();
  }
  return broadcast();
}

// ---------------------------------------------------------------- window

function placement(cfg) {
  const displays = screen.getAllDisplays();
  const display =
    displays.find((d) => d.id === cfg.display) || screen.getPrimaryDisplay();
  const area = display.workArea;
  const x =
    cfg.side === 'left'
      ? area.x + EDGE_GAP
      : area.x + area.width - RAIL_W - EDGE_GAP;
  const y =
    cfg.y === null
      ? Math.round(area.y + (area.height - RAIL_H) / 2)
      : Math.min(Math.max(cfg.y, area.y), area.y + area.height - RAIL_H);
  return { x, y, display };
}

function createWindow() {
  const cfg = loadConfig();
  const { x, y } = placement(cfg);

  win = new BrowserWindow({
    width: RAIL_W,
    height: RAIL_H,
    x,
    y,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    icon: ICON,
    title: 'Droprail',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  win.setAlwaysOnTop(cfg.onTop, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // A drop must never end up as navigation; that would replace the rail with
  // the image itself.
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  win.on('moved', () => {
    clearTimeout(moveTimer);
    moveTimer = setTimeout(snapToEdge, 260);
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html')).then(() => {
    // showInactive: the rail must never steal focus from your browser.
    if (!loadConfig().hidden) win.showInactive();
  });
}

// After you drag it around, the rail snaps to the nearest side of whichever
// screen it ended up on.
function snapToEdge() {
  if (!win || win.isDestroyed()) return;
  const bounds = win.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const area = display.workArea;
  const center = bounds.x + bounds.width / 2;
  const side = center < area.x + area.width / 2 ? 'left' : 'right';
  const cfg = saveConfig({ side, y: bounds.y, display: display.id });
  const pos = placement(cfg);
  win.setBounds({ x: pos.x, y: pos.y, width: RAIL_W, height: RAIL_H });
  broadcast();
}

function toggleWindow() {
  if (!win || win.isDestroyed()) {
    createWindow();
    return;
  }
  saveConfig({ hidden: win.isVisible() });
  applyConfig();
}

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }

  settingsWin = new BrowserWindow({
    width: 440,
    height: 760,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: '#161a21',
    title: 'Droprail settings',
    icon: ICON,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  settingsWin.setMenuBarVisibility(false);
  settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWin.on('closed', () => {
    settingsWin = null;
  });
}

// ---------------------------------------------------------------- ipc

ipcMain.handle('drop', async (_e, payload) => {
  try {
    const { file, thumb } = await catcher.handleDrop(payload || {});
    const ext = path.extname(file).replace('.', '').toUpperCase();
    return { ok: true, file, name: path.basename(file), ext, thumb };
  } catch (err) {
    console.error('drop failed:', err);
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('state', () => broadcast());

ipcMain.handle('open-dir', () => {
  shell.openPath(targetDir());
});

ipcMain.handle('reveal', (_e, file) => {
  if (file && fs.existsSync(file)) shell.showItemInFolder(file);
});

ipcMain.handle('menu', () => {
  buildContextMenu().popup({ window: win });
});

ipcMain.handle('settings', () => openSettings());

ipcMain.handle('pick-dir', async () => {
  const chosen = await chooseDir();
  return chosen || loadConfig().dir;
});

// One door for every switch; anything unknown changes nothing.
ipcMain.handle('set', (_e, key, value) => {
  switch (key) {
    case 'onTop':
      saveConfig({ onTop: !!value });
      break;
    case 'side':
      saveConfig({ side: value === 'left' ? 'left' : 'right' });
      break;
    case 'rest':
      saveConfig({ rest: snapRest(value) });
      break;
    case 'hidden':
      saveConfig({ hidden: !!value });
      break;
    case 'preview':
      saveConfig({ preview: ['type', 'thumb', 'off'].includes(value) ? value : 'type' });
      break;
    case 'autostart':
      app.setLoginItemSettings({ openAtLogin: !!value });
      break;
    case 'dir':
      if (typeof value === 'string' && value) saveConfig({ dir: value });
      break;
    default:
      return broadcast();
  }
  return applyConfig();
});

// ---------------------------------------------------------------- tray + menu

async function chooseDir() {
  const cfg = loadConfig();
  const parent = settingsWin && !settingsWin.isDestroyed() ? settingsWin : undefined;
  const res = await dialog.showOpenDialog(parent, {
    title: 'Choose a folder for caught images',
    defaultPath: cfg.dir,
    properties: ['openDirectory', 'createDirectory'],
  });
  if (res.canceled || !res.filePaths[0]) return null;
  saveConfig({ dir: res.filePaths[0] });
  applyConfig();
  return res.filePaths[0];
}

function buildContextMenu() {
  const cfg = loadConfig();
  return Menu.buildFromTemplate([
    { label: cfg.dir, enabled: false },
    { label: 'Open folder', click: () => shell.openPath(targetDir()) },
    { label: 'Settings...', click: openSettings },
    { type: 'separator' },
    {
      label: 'Show rail',
      type: 'checkbox',
      checked: !cfg.hidden,
      click: toggleWindow,
    },
    {
      label: 'Always on top',
      type: 'checkbox',
      checked: cfg.onTop,
      click: (item) => {
        saveConfig({ onTop: item.checked });
        applyConfig();
      },
    },
    {
      label: 'Start at login',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => {
        app.setLoginItemSettings({ openAtLogin: item.checked });
        broadcast();
      },
    },
    { type: 'separator' },
    { label: 'Quit Droprail', click: () => app.quit() },
  ]);
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(TRAY_ICON).resize({ width: 16, height: 16 }));
  tray.setToolTip('Droprail');
  tray.on('click', toggleWindow);
  tray.on('double-click', openSettings);
  tray.on('right-click', () => tray.popUpContextMenu(buildContextMenu()));
}

// ---------------------------------------------------------------- start

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win && !win.isDestroyed()) {
      saveConfig({ hidden: false });
      applyConfig();
    } else {
      createWindow();
    }
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('nl.gsleraar.droprail');
    // On macOS this belongs in the menu bar, not the Dock: a Dock icon for a
    // window this small is more in the way than it is useful.
    if (MAC && app.dock) app.dock.hide();
    adoptOldConfig();
    createWindow();
    createTray();
  });

  // The rail keeps living in the tray, even when a window is closed.
  app.on('window-all-closed', (e) => e.preventDefault());
}
