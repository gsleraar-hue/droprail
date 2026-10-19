'use strict';

// Starts the real app, opens the settings window and quits again after a few
// seconds. Anything the windows write to the console ends up in the terminal,
// so silent renderer errors become visible.
// Run with: npm run smoke

const { app, BrowserWindow, ipcMain, screen } = require('electron');

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
        offExternal: document.getElementById('offExternal').checked,
        externalHint: document.getElementById('externalHint').textContent,
        quitButton: document.getElementById('quit').textContent,
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

  // ------------------------------------------------------- the button row
  const tools = await rail.webContents.executeJavaScript(`
    (() => {
      const row = document.querySelector('.tools');
      return {
        buttons: Array.from(row.children).map((b) => b.id),
        rowWidth: row.scrollWidth,
        room: document.getElementById('rail').clientWidth,
      };
    })()
  `);
  console.log('buttons on the rail:', JSON.stringify(tools));
  if (!tools.buttons.includes('power')) {
    problems++;
    console.log('FAIL: no off button on the rail');
  }
  if (tools.rowWidth > tools.room) {
    problems++;
    console.log(`FAIL: the buttons (${tools.rowWidth}px) do not fit the rail (${tools.room}px)`);
  }

  // ------------------------------------------------------- moving the rail
  // The window used to be moved by -webkit-app-region; that is gone. The
  // renderer now reports how far the mouse travelled and the main process
  // moves the window, so a synthetic pointer can act out the whole thing.
  const before = rail.getBounds();
  const drag = async (type, x, y) => {
    await rail.webContents.executeJavaScript(`
      document.getElementById('rail').dispatchEvent(
        new PointerEvent(${JSON.stringify(type)}, {
          bubbles: true,
          pointerId: 1,
          button: 0,
          buttons: 1,
          screenX: ${x},
          screenY: ${y},
        })
      )
    `);
    await new Promise((r) => setTimeout(r, 260));
  };

  await drag('pointerdown', 600, 500);
  await drag('pointermove', 460, 590);
  const moved = rail.getBounds();
  console.log('rail halfway through the drag:', JSON.stringify(moved));
  if (moved.x !== before.x - 140 || moved.y !== before.y + 90) {
    problems++;
    console.log('FAIL: the rail did not follow the drag');
  }

  await drag('pointerup', 460, 590);
  const dropped = rail.getBounds();
  console.log('rail after letting go:', JSON.stringify(dropped));
  if (dropped.x === moved.x) {
    problems++;
    console.log('FAIL: the rail did not snap back to the edge');
  }
  const stillDragging = await rail.webContents.executeJavaScript('dragging !== null');
  if (stillDragging) {
    problems++;
    console.log('FAIL: the drag never ended');
  }

  await drag('pointerdown', 460, 590);
  await drag('pointermove', 600, 500);
  await drag('pointerup', 600, 500);
  const back = rail.getBounds();
  console.log('rail back where it started:', JSON.stringify(back));
  if (back.y !== before.y) {
    problems++;
    console.log('FAIL: the rail did not come back to its own spot');
  }

  // A press on a button must not drag the window along.
  const parked = rail.getBounds();
  await drag('pointerdown', 600, 500);
  await drag('pointerup', 600, 500);
  if (rail.getBounds().x !== parked.x || rail.getBounds().y !== parked.y) {
    problems++;
    console.log('FAIL: a press without a move shifted the rail');
  }

  // ------------------------------------------------- off, and back again
  await rail.webContents.executeJavaScript("document.getElementById('power').click(); true");
  await new Promise((r) => setTimeout(r, 500));
  console.log('rail after the off button:', rail.isVisible());
  if (rail.isVisible()) {
    problems++;
    console.log('FAIL: the off button left the rail standing');
  }
  await rail.webContents.executeJavaScript("window.droprail.set('hidden', false)");
  await new Promise((r) => setTimeout(r, 500));
  if (!rail.isVisible()) {
    problems++;
    console.log('FAIL: the rail did not come back');
  }

  // ------------------------------------------ the external-screen rule
  const screens = screen.getAllDisplays();
  const state = await rail.webContents.executeJavaScript('window.droprail.state()');
  console.log(
    `screens: ${screens.length}, built-in: ${screens.filter((d) => d.internal).length}, ` +
      `the rule sees an external screen: ${state.external}`
  );
  await rail.webContents.executeJavaScript("window.droprail.set('offExternal', true)");
  await new Promise((r) => setTimeout(r, 500));
  console.log(`rail with the rule on: ${rail.isVisible()} (should be ${!state.external})`);
  if (rail.isVisible() === state.external) {
    problems++;
    console.log('FAIL: the external-screen rule did not land');
  }
  await rail.webContents.executeJavaScript("window.droprail.set('offExternal', false)");
  await new Promise((r) => setTimeout(r, 500));
  if (!rail.isVisible()) {
    problems++;
    console.log('FAIL: the rail stayed away after the rule went off');
  }

  // The rule can only really be seen on a machine with two screens. Hand the
  // app a made-up pair instead: a laptop panel plus a monitor, then the panel
  // on its own. The real list comes back afterwards.
  const realDisplays = screen.getAllDisplays;
  const fake = (id, internal) => ({
    id,
    internal,
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1040 },
    workAreaSize: { width: 1920, height: 1040 },
    size: { width: 1920, height: 1080 },
    scaleFactor: 1,
    rotation: 0,
  });
  const pretend = async (displays, note) => {
    screen.getAllDisplays = () => displays;
    await rail.webContents.executeJavaScript("window.droprail.set('offExternal', true)");
    await new Promise((r) => setTimeout(r, 400));
    console.log(`${note}: rail up = ${rail.isVisible()}`);
    return rail.isVisible();
  };

  if (await pretend([fake(901, true), fake(902, false)], 'laptop with a monitor')) {
    problems++;
    console.log('FAIL: the rail stayed up next to an external screen');
  }
  if (!(await pretend([fake(901, true)], 'laptop on its own'))) {
    problems++;
    console.log('FAIL: the rail stayed away with only the built-in screen');
  }
  if (await pretend([fake(901, false), fake(902, false)], 'desktop with two monitors')) {
    problems++;
    console.log('FAIL: a second monitor did not count as an external screen');
  }
  screen.getAllDisplays = realDisplays;
  await rail.webContents.executeJavaScript("window.droprail.set('offExternal', false)");
  await new Promise((r) => setTimeout(r, 400));
  if (!rail.isVisible()) {
    problems++;
    console.log('FAIL: the rail did not come back on the real screens');
  }

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
