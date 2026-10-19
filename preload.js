'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('droprail', {
  // Since Electron 32 File.path is always empty; webUtils is the way to the
  // real path of a file dragged in from the file manager.
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file) || '';
    } catch (_) {
      return '';
    }
  },
  drop: (payload) => ipcRenderer.invoke('drop', payload),
  state: () => ipcRenderer.invoke('state'),
  set: (key, value) => ipcRenderer.invoke('set', key, value),
  pickDir: () => ipcRenderer.invoke('pick-dir'),
  openDir: () => ipcRenderer.invoke('open-dir'),
  reveal: (file) => ipcRenderer.invoke('reveal', file),
  menu: () => ipcRenderer.invoke('menu'),
  settings: () => ipcRenderer.invoke('settings'),
  hide: () => ipcRenderer.invoke('hide'),
  quit: () => ipcRenderer.invoke('quit'),
  // Moving the rail: the main process does the actual moving, the renderer
  // only reports how far the mouse has travelled since you grabbed it.
  dragStart: () => ipcRenderer.invoke('drag-start'),
  dragMove: (dx, dy) => ipcRenderer.invoke('drag-move', dx, dy),
  dragEnd: (moved) => ipcRenderer.invoke('drag-end', moved),
  onState: (cb) => ipcRenderer.on('state', (_e, payload) => cb(payload)),
});
