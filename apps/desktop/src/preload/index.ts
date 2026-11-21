import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC, type AppStatus } from '../shared/status.ts';
import type { SaysoApi } from './api';

const api: SaysoApi = {
  getStatus: () => ipcRenderer.invoke(IPC.getStatus) as Promise<AppStatus>,
  onStatus: (callback) => {
    const listener = (_event: IpcRendererEvent, status: AppStatus): void => callback(status);
    ipcRenderer.on(IPC.status, listener);
    return () => ipcRenderer.removeListener(IPC.status, listener);
  },
};

contextBridge.exposeInMainWorld('sayso', api);
