import { describe, expect, it, vi } from 'vitest';
import { IPC } from '../shared/status.ts';
import { openStorage, type Storage } from './core/storage/index.ts';
import { createIpcHandlers, SETTINGS_URLS } from './ipcHandlers.ts';

function setup(withStorage = true) {
  const storage: Storage | null = withStorage
    ? openStorage(':memory:', { historyKeep: () => 50 })
    : null;
  const requested: string[] = [];
  const opened: string[] = [];
  const handlers = createIpcHandlers({
    storage: () => storage,
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
