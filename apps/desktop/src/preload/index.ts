import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC, type HelperStatus } from '../shared/helper-status.ts';
import type { SaysoApi } from './api';

const api: SaysoApi = {
  getHelperStatus: () => ipcRenderer.invoke(IPC.getHelperStatus) as Promise<HelperStatus>,
  onHelperStatus: (callback) => {
    const listener = (_event: IpcRendererEvent, status: HelperStatus): void => callback(status);
    ipcRenderer.on(IPC.helperStatus, listener);
    return () => ipcRenderer.removeListener(IPC.helperStatus, listener);
  },
};

contextBridge.exposeInMainWorld('sayso', api);
