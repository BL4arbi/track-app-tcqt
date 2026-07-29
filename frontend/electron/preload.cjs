const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  generateSolidWorksPreview: (nativeFilePath) => ipcRenderer.invoke('generate-sw-preview', nativeFilePath),
});
