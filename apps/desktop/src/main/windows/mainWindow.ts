import { BrowserWindow } from 'electron';
import { loadView, preloadPath } from './load.ts';

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 520,
    height: 380,
    title: 'Sayso',
    show: false,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.once('ready-to-show', () => win.show());
  loadView(win, 'main');
  return win;
}
