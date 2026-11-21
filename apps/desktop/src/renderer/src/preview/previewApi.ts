import type {
  AppStyle,
  DictionaryEntry,
  HistoryEntry,
  OpenChoice,
  Snippet,
} from '../../../shared/data.ts';
import type { UserSettings } from '../../../shared/settings.ts';
import { initialStatus, type AppStatus } from '../../../shared/status.ts';
import type { SaysoApi } from '../../../preload/api';

/**
 * Development only: a fake `window.sayso` with sample data, so the screens can be designed and
 * checked in an ordinary browser (open the dev URL with `?preview`). Never part of the app build.
 */
const minute = 60_000;
const now = Date.now();

let status: AppStatus = {
  ...initialStatus,
  helper: { state: 'connected', helperVersion: '0.2.0', os: 'macOS 27.0' },
  stt: { state: 'ready', model: 'openai_whisper-large-v3-v20240930_turbo_632MB' },
  fnListener: 'active',
  cleanup: { level: 'full', provider: 'Groq → Gemini' },
  permissions: { microphone: 'granted', accessibility: 'granted' },
  database: { state: 'ok' },
  wakeWord: 'sayso',
  holdKey: 'fn',
  last: {
    text: 'Can we move the call to 3 pm tomorrow? I have a clash with the design review.',
    appName: 'Slack',
    method: 'llm',
    tone: 'casual',
    mode: 'dictation',
    command: 'send',
    sttMs: 640,
    cleanupMs: 230,
  },
};
const listeners = new Set<(s: AppStatus) => void>();
const update = (patch: Partial<AppStatus>): void => {
  status = { ...status, ...patch };
  for (const listener of listeners) listener(status);
};

let settings: UserSettings = {
  pauseMs: 600,
  previewMs: 1000,
  cleanupLevel: 'full',
  skipAi: true,
  historyKeep: 50,
  style: 'default',
  holdKey: 'fn',
  wakeWord: 'sayso',
  language: 'en',
};

const history: HistoryEntry[] = [
  {
    id: 'h1',
    createdAt: now - 2 * minute,
    appBundleId: 'com.tinyspeck.slackmacgap',
    appName: 'Slack',
    mode: 'dictation',
    rawText: 'um can we move the call to 3 pm tomorrow',
    finalText: 'Can we move the call to 3 pm tomorrow?',
    action: { command: 'send', result: 'ran' },
    outcome: 'done',
    latencyMs: 1180,
    cleanup: { method: 'llm', ms: 230, provider: 'groq' },
  },
  {
    id: 'h2',
    createdAt: now - 9 * minute,
    appBundleId: 'com.google.Chrome',
    appName: 'Google Chrome',
    mode: 'command',
    rawText: 'open the first result',
    finalText: null,
    action: { command: 'open_position', result: 'ran' },
    outcome: 'done',
    latencyMs: 820,
    cleanup: null,
  },
  {
    id: 'h3',
    createdAt: now - 31 * minute,
    appBundleId: 'com.apple.Notes',
    appName: 'Notes',
    mode: 'dictation',
    rawText: 'first buy milk second call mom',
    finalText: '1. Buy milk\n2. Call mom',
    action: null,
    outcome: 'done',
    latencyMs: 1460,
    cleanup: { method: 'llm', ms: 310, provider: 'groq' },
  },
  {
    id: 'h4',
    createdAt: now - 58 * minute,
    appBundleId: 'com.google.Chrome',
    appName: 'Google Chrome',
    mode: 'command',
    rawText: 'click delete',
    finalText: null,
    action: { command: 'click', result: 'cancelled' },
    outcome: 'cancelled',
    latencyMs: 900,
    cleanup: null,
  },
  {
    id: 'h5',
    createdAt: now - 3 * 60 * minute,
    appBundleId: 'com.apple.Safari',
    appName: 'Safari',
    mode: 'dictation',
    rawText: null,
    finalText: null,
    action: null,
    outcome: 'blocked',
    latencyMs: 600,
    cleanup: null,
  },
  {
    id: 'h6',
    createdAt: now - 26 * 60 * minute,
    appBundleId: 'com.tinyspeck.slackmacgap',
    appName: 'Slack',
    mode: 'dictation',
    rawText: 'thanks',
    finalText: 'Thanks.',
    action: null,
    outcome: 'done',
    latencyMs: 700,
    cleanup: { method: 'local', ms: 1 },
  },
];
let words: DictionaryEntry[] = [
  { id: 'd1', phrase: 'Sayso', spokenAs: 'say so', updatedAt: now },
  { id: 'd2', phrase: 'Priya', spokenAs: null, updatedAt: now },
];
let snippets: Snippet[] = [
  {
    id: 's1',
    trigger: 'calendly',
    body: 'Book a time that suits you: https://calendly.com/reddy/30min',
    updatedAt: now,
  },
];
let choices: OpenChoice[] = [
  { phrase: 'github', targetType: 'url', target: 'https://github.com', updatedAt: now },
  { phrase: 'slack', targetType: 'app', target: 'com.tinyspeck.slackmacgap', updatedAt: now },
];
let appStyles: AppStyle[] = [
  { bundleId: 'com.tinyspeck.slackmacgap', appName: 'Slack', style: 'chill' },
  { bundleId: 'com.apple.Notes', appName: 'Notes', style: null },
  { bundleId: 'com.google.Chrome', appName: 'Google Chrome', style: null },
];

const later = <T>(value: T): Promise<T> => new Promise((r) => setTimeout(() => r(value), 120));

export const previewApi: SaysoApi = {
  getStatus: () => later(status),
  onStatus: (callback) => {
    listeners.add(callback);
    return () => listeners.delete(callback);
  },
  history: { list: () => later(history), clear: () => later(undefined) },
  dictionary: {
    list: () => later(words),
    add: (phrase, spokenAs) => {
      const entry = { id: `d${words.length + 1}`, phrase, spokenAs, updatedAt: Date.now() };
      words = [...words, entry];
      return later(entry);
    },
    remove: (id) => {
      words = words.filter((w) => w.id !== id);
      return later(undefined);
    },
  },
  snippets: {
    list: () => later(snippets),
    add: (trigger, body) => {
      const s = { id: `s${snippets.length + 1}`, trigger, body, updatedAt: Date.now() };
      snippets = [...snippets, s];
      return later(s);
    },
    remove: (id) => {
      snippets = snippets.filter((s) => s.id !== id);
      return later(undefined);
    },
  },
  settings: {
    get: () => later(settings),
    set: (patch) => {
      settings = { ...settings, ...patch };
      return later(settings);
    },
    reset: () => later(settings),
  },
  appStyles: {
    list: () => later(appStyles),
    set: (bundleId, _appName, style) => {
      appStyles = appStyles.map((a) => (a.bundleId === bundleId ? { ...a, style } : a));
      return later(appStyles);
    },
  },
  handsFree: {
    set: (on) => {
      update({ handsFree: on ? { state: 'listening' } : { state: 'off' } });
      return later(undefined);
    },
  },
  openChoices: {
    list: () => later(choices),
    remove: (phrase) => {
      choices = choices.filter((c) => c.phrase !== phrase);
      return later(undefined);
    },
  },
  permissions: {
    request: () => later(undefined),
    openSettings: () => later(undefined),
  },
};
