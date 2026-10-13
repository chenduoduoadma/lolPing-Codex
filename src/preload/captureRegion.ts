import { contextBridge, ipcRenderer } from 'electron';
import type { CaptureRegionApi } from '../shared/captureRegion';
const api: CaptureRegionApi = {
  image: () => ipcRenderer.invoke('capture-region:image'),
  select: (rect) => ipcRenderer.invoke('capture-region:select', rect),
  cancel: () => ipcRenderer.invoke('capture-region:cancel'),
};
contextBridge.exposeInMainWorld('captureRegionApi', api);
