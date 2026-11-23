import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('lighthouse', {
  demo: () => ipcRenderer.invoke('guide:demo'),
  hide: () => ipcRenderer.invoke('guide:hide'),
  status: () => ipcRenderer.invoke('guide:status'),
  onGuide: (callback: (label: string) => void) => {
    const listener = (_event: unknown, label: string) => callback(label);
    ipcRenderer.on('guide:text', listener);
    return () => ipcRenderer.removeListener('guide:text', listener);
  }
});
