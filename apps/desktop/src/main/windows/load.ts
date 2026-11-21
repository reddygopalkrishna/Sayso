import { join } from 'node:path';
import { app, type BrowserWindow } from 'electron';

export const preloadPath = (): string => join(__dirname, '../preload/index.js');

/** Loads the renderer; `view` selects the screen (main window, listening pill or preview chip). */
export function loadView(win: BrowserWindow, view: 'main' | 'pill' | 'chip'): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (!app.isPackaged && devUrl) void win.loadURL(`${devUrl}#${view}`);
  else void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: view });
}
