# Droprail

A narrow rail at the edge of your screen that catches images. Drag a picture
out of your browser onto the rail and the file is in your folder — the bit
Windows leaves out when you drag onto the File Explorer button in the taskbar,
and the bit macOS only gives you through the Dock.

Windows and macOS. No accounts, no cloud, no telemetry: the only thing it talks
to is the server the image came from.

## Install

Grab the latest build from [Releases](../../releases):

- **Windows** — `Droprail Setup <version>.exe` (installer) or
  `Droprail <version>.exe` (portable, nothing to install).
- **macOS** — `Droprail-<version>-arm64.dmg` for Apple Silicon,
  `Droprail-<version>-x64.dmg` for Intel.

The macOS build is ad-hoc signed, not notarised (that needs a paid Apple
account). The first time, right-click the app and choose **Open**, then confirm.
After that it opens normally.

## Use

- Drag an image from Chrome, Edge, Firefox, Safari or your file manager onto
  the rail.
- Let go and it is saved. The badge at the bottom shows the last catch
  (`PNG`, `JPG`, ...); click it to reveal that file in Explorer or Finder.
- The folder icon opens the target folder, the power icon switches the rail
  off, the gear opens the settings.
- Right-click the rail (or the tray / menu bar icon) for the same menu in short.
- Switched off, Droprail keeps running: one click on the tray (Windows) or menu
  bar (macOS) icon brings the rail back. The first time it says so itself.
- Grab the rail anywhere that is not a button and drag it; let go and it snaps
  to the nearest side of whichever screen it ended up on. The dots at the top
  are there to say the thing can be picked up, but you do not have to aim for
  them.

## Settings

Gear in the rail, or double-click the tray / menu bar icon:

- **Folder** — where everything lands, with a button to browse and one to open
  it. Defaults to `Pictures/Droprail`.
- **Always on top** — keep the rail above your browser, or not.
- **Show rail** — off leaves only the tray (Windows) or menu bar (macOS) icon.
- **Off on an external screen** — the rail disappears by itself while an
  external screen is connected, and comes back when you unplug. Meant for a
  laptop on a dock, where a rail against the edge is in the way more than it
  helps. A laptop counts every screen that is not its own panel (with the lid
  shut, that is the only screen left, which still counts as docked); a desktop
  has no built-in panel, so there it means a second monitor. Asking for the
  rail from the tray menu while the rule is holding it back switches the rule
  off: you asked for it, so you get it.
- **Start at login**.
- **Side of the screen** — left or right.
- **Last catch** — a type badge (default), a thumbnail of the image, or
  nothing. With a badge, no thumbnail is computed at all.
- **Visibility when idle** — how loud the rail is while you are not using it
  (15–100%); it turns fully opaque as soon as you hover or drag. However faint
  it is, you can still grab it and move it.

At the bottom of the window sits **Quit Droprail**, for when you want it gone
rather than out of sight.

Changes are saved as you make them, in `config.json` inside the app's user data
folder (`%APPDATA%\Droprail` on Windows,
`~/Library/Application Support/Droprail` on macOS).

## How it works

A browser rarely hands over a file when you drag a web image — usually it is an
HTML fragment with the source URL in it. So Droprail reads the drag data in
this order:

1. a real file path (dragged from Explorer or Finder) — copy it;
2. loose bytes in the drag — write them out;
3. the `src` from the HTML fragment, else `text/uri-list`, else the plain
   text — download it (with a Referer, since many sites refuse without one).

The extension comes from the URL, else the content type, else the first bytes
of the file itself. Existing files are never overwritten; a ` (2)` is added.

## Limits

- `blob:` images (some web apps render that way) cannot be fetched outside the
  browser.
- Images behind a login only work if the site serves them without a cookie;
  Droprail has no access to your browser session.

## Development

```
npm install
npm start        # run the rail
npm run selftest # the saving logic against the four kinds of drag data (needs the internet)
npm run smoke    # start the app, open settings, flip switches, quit
npm run icon     # redraw build/icon.ico, icon.png and icon.icns
npm run dist     # Windows installer + portable exe in dist/
npm run dist-mac # macOS dmg + zip in dist/ (only works on a Mac)
```

Files: `main.js` (windows, tray, settings), `catcher.js` (unpack the drag,
download, save), `renderer/` (the rail and the settings window), `dev/` (icon
generator and the two tests), `build/after-pack.js` (ad-hoc signing for macOS).

Moving the rail does not go through `-webkit-app-region: drag`. On a frameless
transparent window that region swallows the mouse without moving anything, so
the rail stayed put however hard you pulled. The renderer now reports how far
the pointer has travelled in screen coordinates and `main.js` moves the window
itself — which is also why you can grab the rail anywhere instead of on a strip
of dots the width of a pencil. `npm run smoke` acts the whole thing out with a
synthetic pointer, and fakes a second screen to check the external-screen rule.

Releases are built by GitHub Actions: push a tag (`git tag v0.2.0 && git push
origin v0.2.0`) and a Windows runner and a Mac runner each build their half,
after which one job attaches everything to the release.

## Licence

MIT — see [LICENSE](LICENSE).
