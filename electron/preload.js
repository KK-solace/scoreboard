import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openPresentation: () => ipcRenderer.invoke('open-presentation'),
});
