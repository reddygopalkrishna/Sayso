import { join, resolve } from 'node:path';
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { IPC } from '../shared/status.ts';
import { StatusHub } from './StatusHub.ts';
import { loadConfig } from './config/env.ts';
import { UtterancePipeline } from './core/UtterancePipeline.ts';
import { commands, endCommands } from '@sayso/command-grammar';
import { HelperActions } from './core/actions/HelperActions.ts';
import { TextCleanup } from './core/cleanup/TextCleanup.ts';
import type { DictionaryTerm } from './core/cleanup/dictionary.ts';
import { buildProvider } from './core/cleanup/providers.ts';
import { CommandEngine } from './core/commands/CommandEngine.ts';
import { readContext } from './core/context/HelperContext.ts';
import { AppResolver } from './core/resolver/AppResolver.ts';
import { DictationController } from './core/dictation/DictationController.ts';
import { HelperWhisperSTT } from './core/stt/HelperWhisperSTT.ts';
import { HelperProcess } from './helper/HelperProcess.ts';
import { resolveHelperPath } from './helper/binaryPath.ts';
import { claimSingleInstance } from './singleInstance.ts';
import { HistoryRecorder } from './core/history/HistoryRecorder.ts';
import { PermissionsMonitor } from './core/permissions/PermissionsMonitor.ts';
import { PreviewChip } from './core/safety/PreviewChip.ts';
import { openStorage, type Storage } from './core/storage/index.ts';
import { createIpcHandlers } from './ipcHandlers.ts';
import { createMainWindow } from './windows/mainWindow.ts';
import { Overlay } from './windows/overlay.ts';

// Logging must never crash the app. When the terminal that started a dev build closes, writes to
// stdout/stderr fail with EIO/EPIPE; unhandled, that 'error' event becomes an uncaught exception
// and Electron shows an error dialog on every log line.
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', () => undefined);
}

// Keep settings, models and (later) the database under "Sayso", not the package name.
// SAYSO_DATA_DIR gives a test copy its own database, models folder and single-instance lock.
app.setPath('userData', process.env['SAYSO_DATA_DIR'] ?? join(app.getPath('appData'), 'Sayso'));

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

// Groq first when there is a key (about 0.2 s), Gemini as the fallback; see docs/PLAN_FAST_CLEANUP.md.
const {
  provider,
  label: providerLabel,
  timeoutMs: cleanupTimeoutMs,
} = buildProvider(config, (message) => console.warn(message));
status.update({ cleanup: { level: config.cleanupLevel, provider: providerLabel } });

const stt = new HelperWhisperSTT(helper);
const actions = new HelperActions(helper);

// The local database (history, dictionary, remembered choices). Opened in whenReady, once this
// copy owns the app. If it cannot be opened, dictation still works without those features.
let storage: Storage | null = null;
const warn = (what: string, error: unknown): void => console.warn(`[storage] ${what}`, error);

const historyRecorder = new HistoryRecorder({
  record: (entry) => {
    try {
      storage?.history.record(entry);
    } catch (error) {
      warn('could not save history', error);
    }
  },
});
let deliverStartedAt = Date.now();

const permissions = new PermissionsMonitor({
  ask: async () => {
    const reply = await helper.request({ type: 'getPermissions' }, { timeoutMs: 1_500 });
    if (reply.type !== 'permissions') throw new Error(`expected permissions, got ${reply.type}`);
    return reply;
  },
  onChange: (current) => {
    console.info(
      `[permissions] microphone: ${current.microphone}, accessibility: ${current.accessibility}`,
    );
    status.update({ permissions: current });
  },
});

// Escape presses reported by the helper while the preview chip is showing.
const escapeListeners = new Set<() => void>();
let previewSeq = 0;
const chip = new PreviewChip({
  show: (label, ms) => status.update({ preview: { id: ++previewSeq, label, ms } }),
  hide: () => status.update({ preview: null }),
  captureEscape: (enabled) => actions.captureEscape(enabled),
  onEscape: (listener) => {
    escapeListeners.add(listener);
    return () => escapeListeners.delete(listener);
  },
});

/** Your own words, for spelling fixes in dictation and in spoken commands. Never throws. */
function readDictionary(): DictionaryTerm[] {
  try {
    return storage?.dictionary.list() ?? [];
  } catch (error) {
    warn('could not read the dictionary', error);
    return [];
  }
}

const pipeline = new UtterancePipeline({
  readContext: () => readContext(helper),
  // A risky button waits for "yes": show the prompt, and catch Esc while it is up.
  onAwaitConfirm: (prompt, ms) => {
    dictation.showPrompt(prompt, ms);
    void actions.captureEscape(true).catch(() => undefined);
  },
  onConfirmEnd: () => {
    dictation.clearPrompt();
    void actions.captureEscape(false).catch(() => undefined);
  },
  cleanup: new TextCleanup({
    provider,
    timeoutMs: cleanupTimeoutMs,
    level: () => config.cleanupLevel,
    skipWhenClean: () => config.skipAi,
    dictionary: readDictionary,
  }),
  actions,
  chip,
  endCommands,
  engine: new CommandEngine(commands),
  dictionary: readDictionary,
  resolver: new AppResolver(() => actions.listApps(), {
    get: (phrase) => {
      try {
        return storage?.resolverMemory.get(phrase) ?? null;
      } catch (error) {
        warn('could not read remembered choices', error);
        return null;
      }
    },
    set: (phrase, targetType, target) => {
      try {
        storage?.resolverMemory.set(phrase, targetType, target);
      } catch (error) {
        warn('could not save a remembered choice', error);
      }
    },
  }),
  pauseMs: () => config.pauseMs,
  previewMs: () => config.previewMs,
  onFailure: (failure) => historyRecorder.recordFailure(failure, Date.now() - deliverStartedAt),
  onOutcome: (outcome) => {
    const { mode, segment, context, routing, cleanup, inserted, command } = outcome;
    historyRecorder.recordOutcome(outcome, Date.now() - deliverStartedAt);
    const ranCommand = command?.result === 'ran' ? command.id : null;
    const app = context.appName ?? 'unknown app';
    if (cleanup) {
      console.info(
        `[cleanup] ${cleanup.method} (${cleanup.tone}) in ${cleanup.ms} ms for ${app}` +
          (cleanup.fallbackReason ? `; fallback: ${cleanup.fallbackReason}` : '') +
          (cleanup.note ? `; no AI needed: ${cleanup.note}` : ''),
      );
    }
    const result =
      command?.result === 'skipped' ? `skipped: ${command.reason}` : (command?.result ?? '');
    if (mode === 'command' && command) {
      console.info(`[command] "${segment.text.trim()}" → ${command.id} ${result} in ${app}`);
    } else if (routing?.command && command) {
      const gap =
        routing.command.gapMs === null
          ? 'said alone'
          : `after ${Math.round(routing.command.gapMs)} ms pause`;
      console.info(`[command] ${command.id} (${gap}) ${result} in ${app}`);
    } else if (routing?.keptAsText) {
      console.info(`[command] trailing command kept as text (${routing.keptAsText}) in ${app}`);
    }
    if (!inserted && !ranCommand) return;
    status.update({
      last: {
        text: mode === 'command' ? segment.text.trim() : (cleanup?.text ?? ''),
        appName: context.appName,
        mode,
        method: cleanup?.method ?? 'off',
        tone: cleanup?.tone ?? 'casual',
        command: ranCommand,
        sttMs: segment.sttMs,
        cleanupMs: cleanup?.ms ?? 0,
      },
    });
  },
});
const dictation = new DictationController({
  stt,
  // While speech-to-text runs, open the connection to the AI so the cleanup request does not wait.
  onRelease: (mode) => {
    if (mode === 'dictation' && config.cleanupLevel === 'full') provider?.warmUp?.();
  },
  deliver: (segment, mode) => {
    deliverStartedAt = Date.now();
    return pipeline.deliver(segment, mode);
  },
  log: (msg) => console.info(`[dictation] ${msg}`),
});

helper.onStatus((helperStatus) => {
  status.update({ helper: helperStatus });
  if (helperStatus.state === 'connected') void permissions.refresh();
  else permissions.reset();
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
    case 'escape':
      pipeline.cancelPending();
      for (const listener of [...escapeListeners]) listener();
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

let mainWindow: BrowserWindow | null = null;
function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) mainWindow = createMainWindow();
  else mainWindow.show();
  mainWindow.focus();
}

app.whenReady().then(async () => {
  const mayRun = await claimSingleInstance(
    {
      requestSingleInstanceLock: () => app.requestSingleInstanceLock(),
      onSecondInstance: (listener) => app.on('second-instance', listener),
    },
    {
      newestWins: !app.isPackaged,
      onSecondInstance: showMainWindow,
      onReplaced: () => {
        if (!shuttingDown) console.info('[app] a newer copy of Sayso started; quitting this one');
        shutdown();
      },
    },
  );
  if (!mayRun) {
    console.error(
      app.isPackaged
        ? '[app] Sayso is already running'
        : '[app] another Sayso copy is still running and did not quit (older build?). Quit it and try again.',
    );
    app.exit(0);
    return;
  }

  try {
    storage = openStorage(join(app.getPath('userData'), 'sayso.sqlite'), {
      historyKeep: () => config.historyKeep,
    });
    status.update({ database: { state: 'ok' } });
  } catch (error) {
    console.error('[storage] could not open the local database', error);
    status.update({
      database: { state: 'error', message: error instanceof Error ? error.message : String(error) },
    });
  }

  const handlers = createIpcHandlers({
    storage: () => storage,
    requestPermission: async (kind) => {
      // The microphone prompt waits for the user's answer, so allow plenty of time.
      const reply = await helper.request(
        { type: 'requestPermission', kind },
        { timeoutMs: 120_000 },
      );
      if (reply.type === 'permissions') permissions.accept(reply);
    },
    openExternal: (url) => shell.openExternal(url),
  });
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, (_event, raw: unknown) => handler(raw));
  }
  permissions.start();

  ipcMain.handle(IPC.getStatus, () => status.current);
  status.onChange((current) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC.status, current);
    }
  });

  const pill = new Overlay({ view: 'pill', width: 220, height: 44, bottomOffset: 28 });
  dictation.onState((dictationState) =>
    dictationState.phase === 'idle' ? pill.hide(150) : pill.show(),
  );
  // The chip sits just above the pill.
  const chipWindow = new Overlay({ view: 'chip', width: 300, height: 56, bottomOffset: 82 });
  status.onChange((current) => (current.preview ? chipWindow.show() : chipWindow.hide()));

  helper.start();
  showMainWindow();

  // Clicking the Dock icon brings the status window back after it was closed.
  app.on('activate', showMainWindow);
});

// One shutdown path for every way of quitting (⌘Q, Dock, replaced by a newer copy). It runs once,
// stops the helper, then exits directly: app.exit() does not re-emit before-quit, so repeated quit
// requests (a newer copy retries the lock every 250 ms) cannot leave the app half-quit.
let shuttingDown = false;
function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  permissions.stop();
  void helper.stop().finally(() => {
    try {
      storage?.close();
    } catch (error) {
      warn('could not close the database', error);
    }
    app.exit(0);
  });
}

app.on('before-quit', (event) => {
  event.preventDefault();
  shutdown();
});

// Sayso keeps running (Fn listening) with no windows open, like other menu-bar style tools.
app.on('window-all-closed', () => undefined);
