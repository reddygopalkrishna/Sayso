import { describe, expect, it, vi } from 'vitest';
import type { SettingsPatch, UserSettings } from '../shared/settings.ts';
import { IPC } from '../shared/status.ts';
import { openStorage, type Storage } from './core/storage/index.ts';
import { createIpcHandlers, SETTINGS_URLS, UserMessageError } from './ipcHandlers.ts';

const defaults: UserSettings = {
  pauseMs: 600,
  previewMs: 1000,
  cleanupLevel: 'full',
  skipAi: true,
  historyKeep: 50,
  style: 'default',
  holdKey: 'fn',
  wakeWord: 'sayso',
  language: 'en',
  interpret: true,
  cloudSpeech: false,
};
const settings = {
  current: () => defaults,
  apply: (patch: SettingsPatch) => ({ ...defaults, ...patch }),
  reset: () => defaults,
};

const handsFreeCalls: boolean[] = [];
const handsFree = {
  set: async (on: boolean) => {
    if (on && handsFreeCalls.includes(true)) {
      throw new UserMessageError('The speech model is still loading. Try again in a moment.');
    }
    handsFreeCalls.push(on);
  },
};

function setup(withStorage = true) {
  const storage: Storage | null = withStorage
    ? openStorage(':memory:', { historyKeep: () => 50 })
    : null;
  const requested: string[] = [];
  const opened: string[] = [];
  const handlers = createIpcHandlers({
    storage: () => storage,
    settings,
    handsFree,
    requestPermission: async (kind) => void requested.push(kind),
    openExternal: async (url) => void opened.push(url),
  });
  const call = (channel: string, input: unknown = null) => {
    const handler = handlers[channel];
    if (!handler) throw new Error(`no handler for ${channel}`);
    return handler(input);
  };
  return { storage, call, requested, opened };
}

describe('settings over IPC', () => {
  it('reads the current settings', async () => {
    const { call } = setup();
    expect(await call(IPC.getSettings)).toEqual({ ok: true, value: defaults });
  });

  it('applies a valid change', async () => {
    const { call } = setup();
    expect(await call(IPC.setSettings, { pauseMs: 900, cleanupLevel: 'light' })).toEqual({
      ok: true,
      value: { ...defaults, pauseMs: 900, cleanupLevel: 'light' },
    });
  });

  it.each([
    ['too short a pause', { pauseMs: 50 }],
    ['too long a preview', { previewMs: 99_999 }],
    ['an unknown level', { cleanupLevel: 'extreme' }],
    ['a fraction of a row', { historyKeep: 2.5 }],
    ['an unknown setting', { apiKey: 'x' }],
    ['a wrong type', { skipAi: 'yes' }],
  ])('refuses %s', async (_label, patch) => {
    const { call } = setup();
    expect(await call(IPC.setSettings, patch)).toEqual({
      ok: false,
      error: 'That request was not valid.',
    });
  });

  it('resets to the starting values', async () => {
    const { call } = setup();
    expect(await call(IPC.resetSettings)).toEqual({ ok: true, value: defaults });
  });
});

describe('about me over IPC', () => {
  it('saves facts and answers everything saved', async () => {
    const { call } = setup();
    expect(await call(IPC.getProfile)).toEqual({ ok: true, value: {} });
    expect(await call(IPC.setProfile, { name: 'Keshav', email: 'k@example.com' })).toEqual({
      ok: true,
      value: { name: 'Keshav', email: 'k@example.com' },
    });
    expect(await call(IPC.setProfile, { email: '' })).toEqual({
      ok: true,
      value: { name: 'Keshav' },
    });
  });

  it.each([
    ['an unknown field', { passport: 'X123' }],
    ['a value that is too long', { name: 'x'.repeat(501) }],
    ['a value that is not text', { phone: 123 }],
  ])('refuses %s', async (_label, patch) => {
    const { call } = setup();
    expect(await call(IPC.setProfile, patch)).toEqual({
      ok: false,
      error: 'That request was not valid.',
    });
  });

  it('shows a readable message for characters it cannot type', async () => {
    const { call } = setup();
    expect(await call(IPC.setProfile, { name: 'bad\u0000name' })).toEqual({
      ok: false,
      error: 'That has characters Sayso cannot type.',
    });
  });
});

describe('hands-free over IPC', () => {
  it('turns it on and off, and shows a readable reason when it cannot start', async () => {
    const { call } = setup();
    expect(await call(IPC.setHandsFree, true)).toEqual({ ok: true, value: null });
    expect(await call(IPC.setHandsFree, false)).toEqual({ ok: true, value: null });
    expect(await call(IPC.setHandsFree, true)).toEqual({
      ok: false,
      error: 'The speech model is still loading. Try again in a moment.',
    });
  });

  it('refuses anything but true or false', async () => {
    const { call } = setup();
    expect(await call(IPC.setHandsFree, 'on')).toEqual({
      ok: false,
      error: 'That request was not valid.',
    });
  });

  it.each([['Kairo'], ['two words'], ['x'], ['9lives']])(
    'refuses the wake word %j (one lowercase word, 2–30 letters or digits)',
    async (wakeWord) => {
      const { call } = setup();
      expect(await call(IPC.setSettings, { wakeWord })).toEqual({
        ok: false,
        error: 'That request was not valid.',
      });
    },
  );

  it('accepts a valid wake word', async () => {
    const { call } = setup();
    expect(await call(IPC.setSettings, { wakeWord: 'kairo' })).toMatchObject({ ok: true });
  });
});

describe('app styles over IPC', () => {
  it('lists, sets and clears an app style', async () => {
    const { call } = setup();
    expect(await call(IPC.listAppStyles)).toEqual({ ok: true, value: [] });
    expect(
      await call(IPC.setAppStyle, {
        bundleId: 'com.apple.Notes',
        appName: 'Notes',
        style: 'chill',
      }),
    ).toEqual({
      ok: true,
      value: [{ bundleId: 'com.apple.Notes', appName: 'Notes', style: 'chill' }],
    });
    expect(
      await call(IPC.setAppStyle, { bundleId: 'com.apple.Notes', appName: 'Notes', style: null }),
    ).toEqual({ ok: true, value: [] });
  });

  it.each([
    ['an unknown style', { bundleId: 'a', appName: null, style: 'loud' }],
    ['no app', { bundleId: '', appName: null, style: 'chill' }],
    ['an extra field', { bundleId: 'a', appName: null, style: 'chill', admin: true }],
  ])('refuses %s', async (_label, input) => {
    const { call } = setup();
    expect(await call(IPC.setAppStyle, input)).toEqual({
      ok: false,
      error: 'That request was not valid.',
    });
  });

  it('accepts the everywhere style as a setting', async () => {
    const { call } = setup();
    expect(await call(IPC.setSettings, { style: 'chill' })).toMatchObject({ ok: true });
    expect(await call(IPC.setSettings, { style: 'loud' })).toEqual({
      ok: false,
      error: 'That request was not valid.',
    });
  });
});

describe('snippets over IPC', () => {
  it('adds, lists and removes', async () => {
    const { call } = setup();
    const added = await call(IPC.addSnippet, {
      trigger: 'calendly',
      body: 'https://calendly.com/me',
    });
    expect(added).toMatchObject({
      ok: true,
      value: { trigger: 'calendly', body: 'https://calendly.com/me' },
    });
    expect(await call(IPC.listSnippets)).toMatchObject({
      ok: true,
      value: [{ trigger: 'calendly' }],
    });
    const id = (added as { value: { id: string } }).value.id;
    expect(await call(IPC.removeSnippet, id)).toEqual({ ok: true, value: true });
    expect(await call(IPC.listSnippets)).toEqual({ ok: true, value: [] });
  });

  it('shows a readable message for input it rejects', async () => {
    const { call } = setup();
    expect(await call(IPC.addSnippet, { trigger: '  ', body: 'text' })).toEqual({
      ok: false,
      error: 'Type the words you will say.',
    });
  });

  it('refuses a malformed request', async () => {
    const { call } = setup();
    expect(await call(IPC.addSnippet, { trigger: 'x' })).toEqual({
      ok: false,
      error: 'That request was not valid.',
    });
  });
});

describe('dictionary over IPC', () => {
  it('adds, lists and removes', async () => {
    const { call } = setup();
    const added = await call(IPC.addDictionary, { phrase: 'Sayso', spokenAs: 'say so' });
    expect(added).toMatchObject({ ok: true, value: { phrase: 'Sayso', spokenAs: 'say so' } });
    const listed = await call(IPC.listDictionary);
    expect(listed).toMatchObject({ ok: true, value: [{ phrase: 'Sayso' }] });
    const id = (added as { value: { id: string } }).value.id;
    expect(await call(IPC.removeDictionary, id)).toEqual({ ok: true, value: true });
    expect(await call(IPC.listDictionary)).toEqual({ ok: true, value: [] });
  });

  it('shows a readable message for input the dictionary rejects', async () => {
    const { call } = setup();
    expect(await call(IPC.addDictionary, { phrase: '   ', spokenAs: null })).toEqual({
      ok: false,
      error: 'Type the word or name to add.',
    });
  });

  it.each([
    ['a missing field', { phrase: 'x' }],
    ['an extra field', { phrase: 'x', spokenAs: null, admin: true }],
    ['the wrong type', { phrase: 5, spokenAs: null }],
    ['too long', { phrase: 'x'.repeat(201), spokenAs: null }],
    ['not an object', 'Sayso'],
  ])('rejects %s', async (_label, input) => {
    const { call, storage } = setup();
    expect(await call(IPC.addDictionary, input)).toEqual({
      ok: false,
      error: 'That request was not valid.',
    });
    expect(storage?.dictionary.count()).toBe(0);
  });
});

describe('history and open choices over IPC', () => {
  it('lists and clears history', async () => {
    const { call, storage } = setup();
    storage?.history.record({
      appBundleId: null,
      appName: null,
      mode: 'dictation',
      rawText: 'a',
      finalText: 'A.',
      action: null,
      outcome: 'done',
      latencyMs: 1,
      cleanup: null,
    });
    expect(await call(IPC.listHistory)).toMatchObject({ ok: true, value: [{ finalText: 'A.' }] });
    expect(await call(IPC.clearHistory)).toEqual({ ok: true, value: null });
    expect(await call(IPC.listHistory)).toEqual({ ok: true, value: [] });
  });

  it('lists and removes remembered open choices', async () => {
    const { call, storage } = setup();
    storage?.resolverMemory.set('github', 'url', 'https://github.com');
    expect(await call(IPC.listOpenChoices)).toMatchObject({
      ok: true,
      value: [{ phrase: 'github' }],
    });
    expect(await call(IPC.removeOpenChoice, 'GitHub')).toEqual({ ok: true, value: true });
  });

  it('says so when the database is not available', async () => {
    const { call } = setup(false);
    expect(await call(IPC.listHistory)).toEqual({ ok: false, error: 'Something went wrong.' });
  });
});

describe('permissions over IPC', () => {
  it('asks for a permission', async () => {
    const { call, requested } = setup();
    expect(await call(IPC.requestPermission, 'microphone')).toEqual({ ok: true, value: null });
    expect(requested).toEqual(['microphone']);
  });

  it('opens only the settings panes it knows, never a URL from the renderer', async () => {
    const { call, opened } = setup();
    await call(IPC.openSettings, 'accessibility');
    await call(IPC.openSettings, 'keyboard');
    expect(opened).toEqual([SETTINGS_URLS.accessibility, SETTINGS_URLS.keyboard]);
    for (const bad of [
      'https://evil.example',
      'file:///etc/passwd',
      'screen',
      '',
      { pane: 'microphone' },
    ]) {
      expect(await call(IPC.openSettings, bad)).toEqual({
        ok: false,
        error: 'That request was not valid.',
      });
    }
    expect(opened).toHaveLength(2);
  });

  it('refuses an unknown permission kind', async () => {
    const { call, requested } = setup();
    expect(await call(IPC.requestPermission, 'camera')).toMatchObject({ ok: false });
    expect(requested).toEqual([]);
  });

  it('every settings URL is a System Settings link', () => {
    for (const url of Object.values(SETTINGS_URLS))
      expect(url.startsWith('x-apple.systempreferences:')).toBe(true);
  });

  it('logs unexpected errors but returns a generic message', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const handlers = createIpcHandlers({
      storage: () => null,
      settings,
      handsFree,
      requestPermission: async () => {
        throw new Error('secret internal detail');
      },
      openExternal: async () => undefined,
    });
    const result = await handlers[IPC.requestPermission]?.('microphone');
    expect(result).toEqual({ ok: false, error: 'Something went wrong.' });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
