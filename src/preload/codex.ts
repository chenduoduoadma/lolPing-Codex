import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { CodexApi, CodexState } from '../shared/codex';
const api: CodexApi = {
  state: () => ipcRenderer.invoke('codex:state'),
  preferences: (value) => ipcRenderer.invoke('codex:preferences', value),
  chooseWorkspace: () => ipcRenderer.invoke('codex:workspace'),
  chooseCodex: () => ipcRenderer.invoke('codex:executable'),
  selectDisplay: (id) => ipcRenderer.invoke('codex:display', id),
  capture: () => ipcRenderer.invoke('codex:capture'),
  captureRegion: () => ipcRenderer.invoke('codex:capture-region'),
  clearCapture: () => ipcRenderer.invoke('codex:clear-capture'),
  submit: (value) => ipcRenderer.invoke('codex:submit', value),
  cancel: () => ipcRenderer.invoke('codex:cancel'),
  openThread: () => ipcRenderer.invoke('codex:open-thread'),
  onState: (cb) => {
    const listener = (_e: IpcRendererEvent, value: CodexState) => cb(value);
    ipcRenderer.on('codex:changed', listener);
    return () => ipcRenderer.removeListener('codex:changed', listener);
  },
};
contextBridge.exposeInMainWorld('codexApi', api);
