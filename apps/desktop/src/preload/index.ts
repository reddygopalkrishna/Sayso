import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { IpcResult } from '../shared/data.ts';
import { IPC, type AppStatus } from '../shared/status.ts';
import type { SaysoApi } from './api';

/** Calls the main process and turns { ok: false, error } into a thrown Error with that message. */
async function call<T>(channel: string, input: unknown = null): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, input)) as IpcResult<T>;
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

const api: SaysoApi = {
  getStatus: () => ipcRenderer.invoke(IPC.getStatus) as Promise<AppStatus>,
  onStatus: (callback) => {
    const listener = (_event: IpcRendererEvent, status: AppStatus): void => callback(status);
    ipcRenderer.on(IPC.status, listener);
    return () => ipcRenderer.removeListener(IPC.status, listener);
  },
  history: {
    list: () => call(IPC.listHistory),
    clear: () => call(IPC.clearHistory),
  },
  dictionary: {
    list: () => call(IPC.listDictionary),
    add: (phrase, spokenAs) => call(IPC.addDictionary, { phrase, spokenAs }),
    remove: (id) => call(IPC.removeDictionary, id),
  },
  settings: {
    get: () => call(IPC.getSettings),
    set: (patch) => call(IPC.setSettings, patch),
    reset: () => call(IPC.resetSettings),
  },
  snippets: {
    list: () => call(IPC.listSnippets),
    add: (trigger, body) => call(IPC.addSnippet, { trigger, body }),
    remove: (id) => call(IPC.removeSnippet, id),
  },
  openChoices: {
    list: () => call(IPC.listOpenChoices),
    remove: (phrase) => call(IPC.removeOpenChoice, phrase),
  },
  permissions: {
    request: (kind) => call(IPC.requestPermission, kind),
    openSettings: (pane) => call(IPC.openSettings, pane),
  },
};

contextBridge.exposeInMainWorld('sayso', api);
