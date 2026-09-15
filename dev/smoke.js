'use strict';

// Starts the real app, opens the settings window and quits again after a few
// seconds. Anything the windows write to the console ends up in the terminal,
// so silent renderer errors become visible.
// Run with: npm run smoke

const { app, BrowserWindow, ipcMain } = require('electron');

require('../main');

const LEVELS = ['debug', 'info', 'warning', 'error'];
let problems = 0;

function watch(win, name) {
  win.webContents.on('console-message', (_e, level, message, line, source) => {
    if (level >= 2) problems++;
    console.log(`[${name}] ${LEVELS[level] || level}: ${message} (${source}:${line})`);
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    problems++;
    console.log(`[${name}] renderer gone: ${details.reason}`);
  });
  win.webContents.on('did-fail-load', (_e, code, desc) => {
    problems++;
    console.log(`[${name}] load failed: ${code} ${desc}`);
  });
}

app.whenReady().then(async () => {
  const [rail] = BrowserWindow.getAllWindows();
  watch(rail, 'rail');
  console.log('rail sits at', JSON.stringify(rail.getBounds()));

  await new Promise((r) => setTimeout(r, 1200));

  // Through the same channel as the gear button in the rail.
  await rail.webContents.executeJavaScript('window.droprail.settings()');
  await new Promise((r) => setTimeout(r, 1500));

  const settings = BrowserWindow.getAllWindows().find((w) => w !== rail);
  if (!settings) {
    problems++;
    console.log('FAIL: the settings window did not open');
  } else {
    watch(settings, 'settings');
    const seen = await settings.webContents.executeJavaScript(`
      ({
        folder: document.getElementById('dir').textContent,
        onTop: document.getElementById('onTop').checked,
        side: document.querySelector('#side button.on') && document.querySelector('#side button.on').dataset.side,
        catch: document.querySelector('#preview button.on') && document.querySelector('#preview button.on').dataset.preview,
        rest: document.getElementById('rest').value,
        hint: document.getElementById('shownHint').textContent,
        height: document.body.scrollHeight,
      })
    `);
    console.log('settings show:', JSON.stringify(seen));
    if (!seen.folder) {
      problems++;
      console.log('FAIL: no folder filled in');
    }
    if (!seen.side) {
      problems++;
      console.log('FAIL: no side marked');
    }
    if (seen.height > settings.getContentBounds().height) {
      console.log(
        `NOTE: content (${seen.height}px) does not fit the window (${
          settings.getContentBounds().height
        }px)`
      );
    }

    // Flip a switch and back, and see whether the rail follows.
    await settings.webContents.executeJavaScript(
      "document.getElementById('onTop').click(); true"
    );
    await new Promise((r) => setTimeout(r, 400));
    console.log('after turning always-on-top off:', rail.isAlwaysOnTop());
    await settings.webContents.executeJavaScript(
      "document.getElementById('onTop').click(); true"
    );
    await new Promise((r) => setTimeout(r, 400));
    console.log('after turning it back on:', rail.isAlwaysOnTop());

    await settings.webContents.executeJavaScript(
      "document.querySelector('#side button[data-side=\\\"left\\\"]').click(); true"
    );
    await new Promise((r) => setTimeout(r, 400));
    console.log('rail after side left:', JSON.stringify(rail.getBounds()));
    await settings.webContents.executeJavaScript(
      "document.querySelector('#side button[data-side=\\\"right\\\"]').click(); true"
    );
    await new Promise((r) => setTimeout(r, 400));
    console.log('rail after side right:', JSON.stringify(rail.getBounds()));
  }

  const rest = await rail.webContents.executeJavaScript(
    "getComputedStyle(document.getElementById('rail')).opacity"
  );
  console.log('idle opacity of the rail:', rest);

  // Act out the three settings for the last catch without a real drop: the
  // rail gets handed the same answer it would get after a successful one.
  for (const mode of ['type', 'thumb', 'off']) {
    const seen = await rail.webContents.executeJavaScript(`
      (() => {
        preview = ${JSON.stringify(mode)};
        showLast({ file: 'C:\\\\folder\\\\picture.png', name: 'picture.png', ext: 'PNG', thumb: '' });
        const kind = document.getElementById('kind');
        return {
          boxVisible: !document.getElementById('last').hidden,
          label: kind.hidden ? null : kind.textContent,
          colour: kind.hidden ? null : getComputedStyle(kind).color,
        };
      })()
    `);
    console.log(`last catch as "${mode}":`, JSON.stringify(seen));
    if (mode === 'type' && seen.label !== 'PNG') {
      problems++;
      console.log('FAIL: the type badge does not show PNG');
    }
    if (mode === 'off' && seen.boxVisible) {
      problems++;
      console.log('FAIL: the box stays up while it should be off');
    }
  }

  console.log(problems ? `\n${problems} problem(s)` : '\nall good');
  app.exit(problems ? 1 : 0);
});

// Acting out a real drop is not possible outside a browser; dev/selftest.js
// covers that side.
ipcMain.on('never', () => {});
