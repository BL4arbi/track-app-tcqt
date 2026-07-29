const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  generateSolidWorksPreview: (nativeFilePath) => ipcRenderer.invoke('generate-sw-preview', nativeFilePath),
  // File.path was removed from recent Electron versions; webUtils is the
  // documented replacement for resolving a picked <input type="file"> to
  // its real filesystem path, and must be called from the renderer side.
  getPathForFile: (file) => webUtils.getPathForFile(file),
});
