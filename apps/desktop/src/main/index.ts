import { join, resolve } from 'node:path';
import { app, BrowserWindow, ipcMain, Menu, nativeImage, shell, Tray } from 'electron';
import { IPC, type AppStatus } from '../shared/status.ts';
import { StatusHub } from './StatusHub.ts';
import { loadConfig } from './config/env.ts';
import { UtterancePipeline } from './core/UtterancePipeline.ts';
import { commands, endCommands } from '@sayso/command-grammar';
import { HelperActions } from './core/actions/HelperActions.ts';
import { TextCleanup } from './core/cleanup/TextCleanup.ts';
import type { DictionaryTerm } from './core/cleanup/dictionary.ts';
import { buildProvider } from './core/cleanup/providers.ts';
import { BUILT_IN_TERMS } from './core/cleanup/builtInTerms.ts';
import { OpenAIChatJson, type ChatJson } from './core/interpret/chatJson.ts';
import { Interpreter } from './core/interpret/Interpreter.ts';
import { GROQ_BASE_URL, OPENAI_BASE_URL, groqRequestExtras } from './core/cleanup/providers.ts';
import { CommandEngine } from './core/commands/CommandEngine.ts';
import { readContext } from './core/context/HelperContext.ts';
import { AppResolver } from './core/resolver/AppResolver.ts';
import { DoubleTap } from './core/dictation/DoubleTap.ts';
import { DictationController } from './core/dictation/DictationController.ts';
import { describeError } from './core/dictation/errors.ts';
import { applyDictionary } from './core/cleanup/dictionary.ts';
import { HandsFreeController } from './core/handsfree/HandsFreeController.ts';
import { CloudSTT, RoutedSTT } from './core/stt/CloudSTT.ts';
import { HelperWhisperSTT } from './core/stt/HelperWhisperSTT.ts';
import { HelperProcess } from './helper/HelperProcess.ts';
import { resolveHelperPath } from './helper/binaryPath.ts';
import { claimSingleInstance } from './singleInstance.ts';
import { HistoryRecorder } from './core/history/HistoryRecorder.ts';
import { PermissionsMonitor } from './core/permissions/PermissionsMonitor.ts';
import { PreviewChip } from './core/safety/PreviewChip.ts';
import { openStorage, type Storage } from './core/storage/index.ts';
import type { ProfileKey } from '../shared/profile.ts';
import type { UserSettings } from '../shared/settings.ts';
import { createIpcHandlers, UserMessageError } from './ipcHandlers.ts';
import { createMainWindow } from './windows/mainWindow.ts';
import { Overlay } from './windows/overlay.ts';
import { buildTrayMenu, trayKey } from './windows/trayMenu.ts';

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

// The Settings tab edits `config` in place (every part of the app reads it through a closure), and
// what is saved in the database wins over `.env`, which only gives the starting values.
const settingsNow = (): UserSettings => ({
  pauseMs: config.pauseMs,
  previewMs: config.previewMs,
  cleanupLevel: config.cleanupLevel,
  skipAi: config.skipAi,
  historyKeep: config.historyKeep,
  style: config.style,
  holdKey: config.holdKey,
  wakeWord: config.wakeWord,
  language: config.language,
  interpret: config.interpret,
  cloudSpeech: config.cloudSpeech,
});
const startingSettings = settingsNow();
// Tells the helper which key is held to dictate (on connect, after a restart, and on a change).
const sendHoldKey = (): void => {
  // Sent again on connect, so there is nothing to do while the helper is not up yet.
  if (helper.status.state !== 'connected') return;
  void actions
    .setHoldKey(config.holdKey)
    .catch((error: unknown) => warn('could not set the hold key', error));
};
// Tells the helper which language is spoken (on connect and when it changes).
const sendLanguage = (): void => {
  if (helper.status.state !== 'connected') return;
  void actions
    .setLanguage(config.language === 'auto' ? null : config.language)
    .catch((error: unknown) => warn('could not set the language', error));
};
const refreshCleanupStatus = (): void =>
  status.update({
    cleanup: { level: config.cleanupLevel, provider: providerLabel },
    wakeWord: config.wakeWord,
    holdKey: config.holdKey,
  });

const localStt = new HelperWhisperSTT(helper);
const cloudStt = new CloudSTT(helper, {
  apiKey: () => config.openaiApiKey,
  ...(config.openaiSttModel ? { model: config.openaiSttModel } : {}),
  language: () => (config.language === 'auto' ? null : config.language),
  // Names only (built-in list plus your own dictionary), so they are spelled right.
  vocabulary: () => [
    ...BUILT_IN_TERMS.map((t) => t.phrase),
    ...(storage?.dictionary.list().map((t) => t.phrase) ?? []),
  ],
});
// On-device unless Cloud speech is on in Settings AND there is an OpenAI key.
const stt = new RoutedSTT(
  localStt,
  cloudStt,
  () => config.cloudSpeech && Boolean(config.openaiApiKey),
  () => helper.status.state === 'connected',
);
const actions = new HelperActions(helper);

// The local database (history, dictionary, remembered choices). Opened in whenReady, once this
// copy owns the app. If it cannot be opened, dictation still works without those features.
let storage: Storage | null = null;
/** Kept here so the menu-bar icon is not garbage-collected. */
let tray: Tray | null = null;
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
/** The built-in names (ChatGPT, GitHub…) and then your own words, which win when they overlap. */
function readDictionary(): DictionaryTerm[] {
  try {
    return [...BUILT_IN_TERMS, ...(storage?.dictionary.list() ?? [])];
  } catch (error) {
    warn('could not read the dictionary', error);
    return [...BUILT_IN_TERMS];
  }
}

const engine = new CommandEngine(commands);

// "Say it in your own words": Groq first (about 0.3 s), then OpenAI if it has a key and a model.
// Only asked when no exact command matched, and never in a password field or a meeting app.
const interpretClients: ChatJson[] = [];
if (config.groqApiKey && config.aiProvider !== 'gemini') {
  interpretClients.push(
    new OpenAIChatJson({
      name: 'groq',
      model: config.fastModel,
      apiKey: config.groqApiKey,
      baseUrl: GROQ_BASE_URL,
      extraBody: groqRequestExtras(config.fastModel),
    }),
  );
}
if (config.openaiApiKey && config.openaiModel) {
  interpretClients.push(
    new OpenAIChatJson({
      name: 'openai',
      model: config.openaiModel,
      apiKey: config.openaiApiKey,
      baseUrl: OPENAI_BASE_URL,
      tokenField: 'max_completion_tokens',
    }),
  );
}
const interpreter = new Interpreter({
  clients: interpretClients,
  log: (message) => console.info(message),
});

const pipeline = new UtterancePipeline({
  readContext: () => readContext(helper),
  interpret: async (utterance, context) => {
    if (!config.interpret || !interpreter.available) return null;
    let screen: Awaited<ReturnType<typeof actions.listElements>> = [];
    try {
      screen = await actions.listElements();
    } catch {
      // Without the screen the interpreter can still open apps and press keys.
    }
    // Only which facts are saved goes to the AI (by name); the values stay on this Mac.
    const profileKeys = Object.keys(storage?.profile.all() ?? {}) as ProfileKey[];
    return interpreter.interpret({ utterance, appName: context.appName, screen, profileKeys });
  },
  profileValue: (key) => {
    try {
      return storage?.profile.all()[key] ?? null;
    } catch (error) {
      warn('could not read your details', error);
      return null;
    }
  },
  style: (bundleId) => {
    try {
      return storage?.appStyles.get(bundleId) ?? config.style;
    } catch (error) {
      warn('could not read the app style', error);
      return config.style;
    }
  },
  snippets: {
    find: (spoken) => {
      try {
        // Your own snippets win; then the facts about you ("my email", "my address").
        return storage?.snippets.find(spoken) ?? storage?.profile.find(spoken) ?? null;
      } catch (error) {
        warn('could not read snippets', error);
        return null;
      }
    },
  },
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
  engine,
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
  pageWaitMs: () => config.pageWaitMs,
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

// Hands-free: while on, the helper reports every utterance and the controller picks what to act on.
const handsFree = new HandsFreeController({
  listen: { start: () => actions.startListening(), stop: () => actions.stopListening() },
  deliver: (segment, mode) => pipeline.deliver(segment, mode),
  isCommand: (text) => engine.matchChain(applyDictionary(text, readDictionary())) !== null,
  wakeWord: () => config.wakeWord,
  sttReady: () => stt.readiness().ready,
  holdBusy: () => dictation.isBusy(),
  lastHoldAt: () => dictation.lastActiveAt(),
  onError: (message) => dictation.showError(message),
  onStatus: (handsFreeStatus) => status.update({ handsFree: handsFreeStatus }),
  describeError,
  log: (message) => console.info(message),
});

helper.onStatus((helperStatus) => {
  status.update({ helper: helperStatus });
  if (helperStatus.state === 'connected') {
    void permissions.refresh();
    sendHoldKey();
    sendLanguage();
  } else permissions.reset();
  if (helperStatus.state !== 'connected') {
    handsFree.reset(`helper ${helperStatus.state}`);
    localStt.updateStatus(null);
    dictation.reset(`helper ${helperStatus.state}`);
    status.update({ stt: { state: 'unknown' }, fnListener: 'unknown' });
  }
});

const doubleTap = new DoubleTap();

helper.onMessage((message) => {
  switch (message.type) {
    case 'hotkey': {
      // Fn, Fn (two quick taps) turns hands-free on or off; the taps never reach dictation.
      const tap = doubleTap.handle(message.phase, Date.now());
      if (tap === 'double') {
        const on = handsFree.status.state === 'listening' || handsFree.status.state === 'starting';
        console.info(`[hands-free] double tap: turning ${on ? 'off' : 'on'}`);
        (on ? handsFree.disable() : handsFree.enable()).catch((error: unknown) =>
          dictation.showError(error instanceof Error ? error.message : String(error)),
        );
      } else if (tap === 'pass') {
        dictation.handleHotkey(message.phase);
      }
      break;
    }
    case 'heard':
      void handsFree.handleHeard(message);
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
      localStt.updateStatus(message);
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
    Object.assign(config, storage.settings.get());
    refreshCleanupStatus();
    sendHoldKey();
    sendLanguage();
  } catch (error) {
    console.error('[storage] could not open the local database', error);
    status.update({
      database: { state: 'error', message: error instanceof Error ? error.message : String(error) },
    });
  }

  const handlers = createIpcHandlers({
    storage: () => storage,
    handsFree: {
      set: async (on) => {
        try {
          if (on) await handsFree.enable();
          else await handsFree.disable();
        } catch (error) {
          throw new UserMessageError(error instanceof Error ? error.message : String(error), {
            cause: error,
          });
        }
      },
    },
    settings: {
      current: settingsNow,
      apply: (patch) => {
        if (!storage) throw new Error('The local database is not available.');
        storage.settings.set(patch);
        Object.assign(config, patch);
        refreshCleanupStatus();
        if (patch.holdKey) sendHoldKey();
        if (patch.language) sendLanguage();
        return settingsNow();
      },
      reset: () => {
        if (!storage) throw new Error('The local database is not available.');
        storage.settings.reset();
        Object.assign(config, startingSettings);
        refreshCleanupStatus();
        sendHoldKey();
        sendLanguage();
        return settingsNow();
      },
    },
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
  // Shown while dictating, and while hands-free listens (a quiet reminder that the mic is on).
  status.onChange((current) =>
    current.dictation.phase === 'idle' && current.handsFree.state !== 'listening'
      ? pill.hide(150)
      : pill.show(),
  );
  // The chip sits just above the pill.
  const chipWindow = new Overlay({ view: 'chip', width: 300, height: 56, bottomOffset: 82 });
  status.onChange((current) => (current.preview ? chipWindow.show() : chipWindow.hide()));

  // The menu-bar icon: status, the hands-free switch, Open and Quit. Rebuilt only when it changes.
  const icon = nativeImage.createFromPath(join(app.getAppPath(), 'resources', 'trayTemplate.png'));
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('Sayso');
  let shownKey = '';
  const refreshTray = (current: AppStatus): void => {
    const key = trayKey(current);
    if (!tray || key === shownKey) return;
    shownKey = key;
    tray.setContextMenu(
      Menu.buildFromTemplate(
        buildTrayMenu(current, {
          setHandsFree: (on) => {
            (on ? handsFree.enable() : handsFree.disable()).catch((error: unknown) =>
              dictation.showError(error instanceof Error ? error.message : String(error)),
            );
          },
          openWindow: showMainWindow,
          quit: () => app.quit(),
        }),
      ),
    );
  };
  refreshTray(status.current);
  status.onChange(refreshTray);

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
