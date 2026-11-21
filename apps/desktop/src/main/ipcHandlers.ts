import { z } from 'zod';
import type { IpcResult } from '../shared/data.ts';
import { IPC, type SettingsPane } from '../shared/status.ts';
import {
  SettingsPatchSchema,
  STYLES,
  type SettingsPatch,
  type UserSettings,
} from '../shared/settings.ts';
import { DictionaryError } from './core/storage/DictionaryRepo.ts';
import type { Storage } from './core/storage/index.ts';

/** Where each System Settings pane lives. Fixed here: the renderer never supplies a URL. */
export const SETTINGS_URLS: Readonly<Record<SettingsPane, string>> = {
  microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
  accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
  keyboard: 'x-apple.systempreferences:com.apple.Keyboard-Settings.extension',
};

export interface IpcDeps {
  storage: () => Storage | null;
  requestPermission: (kind: 'microphone' | 'accessibility') => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  /** The Settings tab: read, change (already validated) and reset to the starting values. */
  settings: {
    current: () => UserSettings;
    apply: (patch: SettingsPatch) => UserSettings;
    reset: () => UserSettings;
  };
  /** How many history rows the history tab shows at most. */
  historyLimit?: number;
}

export type IpcHandler = (raw: unknown) => Promise<IpcResult<unknown>>;

const nothing = z.null().or(z.undefined());
const text = z.string().max(200);
const addEntry = z.object({ phrase: text, spokenAs: text.nullable() }).strict();
const appStyle = z
  .object({
    bundleId: z.string().min(1).max(200),
    appName: text.nullable(),
    style: z.enum(STYLES).nullable(),
  })
  .strict();
const addSnippet = z.object({ trigger: text, body: z.string().max(4_000) }).strict();
const id = z.string().min(1).max(100);
const permissionKind = z.enum(['microphone', 'accessibility']);
const settingsPane = z.enum(['microphone', 'accessibility', 'keyboard']);

/**
 * One handler per IPC channel: validate the input, run it, and answer { ok, value } or
 * { ok: false, error } so the UI shows a plain message instead of an Electron error.
 */
export function createIpcHandlers(deps: IpcDeps): Record<string, IpcHandler> {
  const storage = (): Storage => {
    const s = deps.storage();
    if (!s) throw new Error('The local database is not available.');
    return s;
  };

  const define =
    <S extends z.ZodType>(
      schema: S,
      run: (input: z.infer<S>) => unknown | Promise<unknown>,
    ): IpcHandler =>
    async (raw) => {
      const parsed = schema.safeParse(raw);
      if (!parsed.success) return { ok: false, error: 'That request was not valid.' };
      try {
        return { ok: true, value: (await run(parsed.data)) ?? null };
      } catch (error) {
        // Messages written for people (DictionaryError) are shown; anything else is kept generic.
        const message = error instanceof DictionaryError ? error.message : 'Something went wrong.';
        if (!(error instanceof DictionaryError)) console.warn('[ipc]', error);
        return { ok: false, error: message };
      }
    };

  return {
    [IPC.listHistory]: define(nothing, () => storage().history.recent(deps.historyLimit ?? 200)),
    [IPC.clearHistory]: define(nothing, () => storage().history.clear()),
    [IPC.listDictionary]: define(nothing, () => storage().dictionary.list()),
    [IPC.addDictionary]: define(addEntry, ({ phrase, spokenAs }) =>
      storage().dictionary.upsert(phrase, spokenAs),
    ),
    [IPC.removeDictionary]: define(id, (entryId) => storage().dictionary.remove(entryId)),
    [IPC.getSettings]: define(nothing, () => deps.settings.current()),
    [IPC.setSettings]: define(SettingsPatchSchema, (patch) => deps.settings.apply(patch)),
    [IPC.resetSettings]: define(nothing, () => deps.settings.reset()),
    [IPC.listAppStyles]: define(nothing, () => storage().appStyles.list()),
    [IPC.setAppStyle]: define(appStyle, ({ bundleId, appName, style }) => {
      storage().appStyles.set(bundleId, appName, style);
      return storage().appStyles.list();
    }),
    [IPC.listSnippets]: define(nothing, () => storage().snippets.list()),
    [IPC.addSnippet]: define(addSnippet, ({ trigger, body }) =>
      storage().snippets.upsert(trigger, body),
    ),
    [IPC.removeSnippet]: define(id, (snippetId) => storage().snippets.remove(snippetId)),
    [IPC.listOpenChoices]: define(nothing, () => storage().resolverMemory.list()),
    [IPC.removeOpenChoice]: define(text, (phrase) => storage().resolverMemory.remove(phrase)),
    [IPC.requestPermission]: define(permissionKind, (kind) => deps.requestPermission(kind)),
    [IPC.openSettings]: define(settingsPane, (pane) => deps.openExternal(SETTINGS_URLS[pane])),
  };
}
