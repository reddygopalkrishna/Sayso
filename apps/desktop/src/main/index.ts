import { join } from 'node:path';
import { app, BrowserWindow, ipcMain } from 'electron';
import { IPC } from '../shared/helper-status.ts';
import { HelperProcess } from './helper/HelperProcess.ts';
import { resolveHelperPath } from './helper/binaryPath.ts';

const helper = new HelperProcess({
  binaryPath: resolveHelperPath({
    env: process.env,
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
  }),
});

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 480,
    height: 320,
    title: 'Sayso',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.once('ready-to-show', () => win.show());

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (!app.isPackaged && devUrl) void win.loadURL(devUrl);
  else void win.loadFile(join(__dirname, '../renderer/index.html'));
  return win;
}

app.whenReady().then(() => {
  ipcMain.handle(IPC.getHelperStatus, () => helper.status);
  helper.onStatus((status) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.helperStatus, status);
    }
  });
  helper.onStatus((status) => {
    if (status.state !== 'connected') return;
    helper.ping().then(
      (ms) => console.info(`helper ping ${ms.toFixed(1)} ms`),
      (error: unknown) => console.warn(`helper ping failed: ${String(error)}`),
    );
  });
  helper.start();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

let quitting = false;
app.on('before-quit', (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  void helper.stop().finally(() => app.quit());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
