import { join, resolve } from 'node:path';
import { app, BrowserWindow, ipcMain } from 'electron';
import { IPC } from '../shared/status.ts';
import { StatusHub } from './StatusHub.ts';
import { loadConfig } from './config/env.ts';
import { UtterancePipeline } from './core/UtterancePipeline.ts';
import { HelperTextInserter } from './core/actions/HelperTextInserter.ts';
import { TextCleanup } from './core/cleanup/TextCleanup.ts';
import { GeminiProvider } from './core/cleanup/gemini.ts';
import { readContext } from './core/context/HelperContext.ts';
import { DictationController } from './core/dictation/DictationController.ts';
import { HelperWhisperSTT } from './core/stt/HelperWhisperSTT.ts';
import { HelperProcess } from './helper/HelperProcess.ts';
import { resolveHelperPath } from './helper/binaryPath.ts';
import { createMainWindow } from './windows/mainWindow.ts';
import { PillWindow } from './windows/pillWindow.ts';

// Logging must never crash the app. When the terminal that started a dev build closes, writes to
// stdout/stderr fail with EIO/EPIPE; unhandled, that 'error' event becomes an uncaught exception
// and Electron shows an error dialog on every log line.
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', () => undefined);
}

// Keep settings, models and (later) the database under "Sayso", not the package name.
app.setPath('userData', join(app.getPath('appData'), 'Sayso'));

const config = loadConfig(
  [
    ...(app.isPackaged ? [] : [resolve(app.getAppPath(), '../../.env')]),
    join(app.getPath('userData'), '.env'),
  ],
  process.env,
);

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

const provider = config.geminiApiKey
  ? new GeminiProvider({ apiKey: config.geminiApiKey, model: config.geminiModel })
  : null;
status.update({
  cleanup: {
    level: config.cleanupLevel,
    provider: provider ? `${provider.name} · ${provider.model}` : null,
  },
});

const stt = new HelperWhisperSTT(helper);
const pipeline = new UtterancePipeline({
  readContext: () => readContext(helper),
  cleanup: new TextCleanup({ provider, level: () => config.cleanupLevel }),
  inserter: new HelperTextInserter(helper),
  onOutcome: ({ segment, context, cleanup, inserted }) => {
    console.info(
      `[cleanup] ${cleanup.method} (${cleanup.tone}) in ${cleanup.ms} ms for ${context.appName ?? 'unknown app'}` +
        (cleanup.fallbackReason ? `; fallback: ${cleanup.fallbackReason}` : ''),
    );
    if (!inserted) return;
    status.update({
      last: {
        text: cleanup.text,
        appName: context.appName,
        method: cleanup.method,
        tone: cleanup.tone,
        sttMs: segment.sttMs,
        cleanupMs: cleanup.ms,
      },
    });
  },
});
const dictation = new DictationController({
  stt,
  deliver: (segment) => pipeline.deliver(segment),
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
