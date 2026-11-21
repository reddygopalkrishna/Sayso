import { join } from 'node:path';
import { app, BrowserWindow, ipcMain } from 'electron';
import { IPC } from '../shared/status.ts';
import { StatusHub } from './StatusHub.ts';
import { HelperTextInserter } from './core/actions/HelperTextInserter.ts';
import { DictationController } from './core/dictation/DictationController.ts';
import { HelperWhisperSTT } from './core/stt/HelperWhisperSTT.ts';
import { HelperProcess } from './helper/HelperProcess.ts';
import { resolveHelperPath } from './helper/binaryPath.ts';
import { createMainWindow } from './windows/mainWindow.ts';
import { PillWindow } from './windows/pillWindow.ts';

// Keep settings, models and (later) the database under "Sayso", not the package name.
app.setPath('userData', join(app.getPath('appData'), 'Sayso'));

const status = new StatusHub();

const helper = new HelperProcess({
  binaryPath: resolveHelperPath({
    env: process.env,
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
  }),
  env: { SAYSO_MODELS_DIR: join(app.getPath('userData'), 'models') },
});

const stt = new HelperWhisperSTT(helper);
const inserter = new HelperTextInserter(helper);
const dictation = new DictationController({
  stt,
  deliver: async (segment) => {
    await inserter.insertText(segment.text);
    status.update({ lastText: segment.text });
  },
  log: (msg) => console.info(`[dictation] ${msg}`),
});

helper.onStatus((helperStatus) => {
  status.update({ helper: helperStatus });
  if (helperStatus.state !== 'connected') {
    stt.updateStatus(null);
    dictation.reset(`helper ${helperStatus.state}`);
    status.update({ stt: { state: 'unknown' }, fnListener: 'unknown' });
  }
});

helper.onMessage((message) => {
  switch (message.type) {
    case 'hotkey':
      dictation.handleHotkey(message.phase);
      break;
    case 'fnListener':
      console.info(`[helper] Fn listener ${message.state}`);
      status.update({ fnListener: message.state });
      break;
    case 'sttStatus':
      console.info(
        `[stt] ${message.model}: ${message.state}${message.msg ? ` (${message.msg})` : ''}`,
      );
      stt.updateStatus(message);
      status.update({
        stt:
          message.state === 'error'
            ? { state: 'error', model: message.model, message: message.msg ?? 'unknown error' }
            : { state: message.state, model: message.model },
      });
      break;
    default:
      break;
  }
});

dictation.onState((dictationState) => status.update({ dictation: dictationState }));

app.whenReady().then(() => {
  ipcMain.handle(IPC.getStatus, () => status.current);
  status.onChange((current) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC.status, current);
    }
  });

  const pill = new PillWindow();
  dictation.onState((dictationState) => pill.show(dictationState));

  helper.start();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().filter((w) => w.isFocusable()).length === 0) {
      createMainWindow();
    }
  });
});

let quitting = false;
app.on('before-quit', (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  void helper.stop().finally(() => app.quit());
});

// Sayso keeps running (Fn listening) with no windows open, like other menu-bar style tools.
app.on('window-all-closed', () => undefined);
