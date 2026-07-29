import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendFileSync } from 'node:fs';
import electronUpdater from 'electron-updater';
const { autoUpdater } = electronUpdater;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

ipcMain.handle('generate-sw-preview', async (_event, nativeFilePath) => {
  const { generateSolidWorksPreview } = await import('./solidworksPreview.js');
  return generateSolidWorksPreview(nativeFilePath);
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: path.join(__dirname, '..', 'asset', 'icon-256.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

const updateLogPath = path.join(app.getPath('userData'), 'update-log.txt');
function logUpdate(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  console.log(line.trim());
  try {
    appendFileSync(updateLogPath, line);
  } catch {
    // logging is best-effort, never block the update flow on it
  }
}

function setupAutoUpdate() {
  logUpdate(`Starting update check. Current version: ${app.getVersion()}`);

  autoUpdater.on('checking-for-update', () => logUpdate('checking-for-update'));
  autoUpdater.on('update-available', (info) => logUpdate(`update-available: ${JSON.stringify(info)}`));
  autoUpdater.on('update-not-available', (info) => logUpdate(`update-not-available: ${JSON.stringify(info)}`));
  autoUpdater.on('error', (err) => logUpdate(`error: ${err?.stack || err}`));
  autoUpdater.on('download-progress', (p) => logUpdate(`download-progress: ${p.percent?.toFixed(1)}%`));

  autoUpdater.on('update-downloaded', async (info) => {
    logUpdate(`update-downloaded: ${JSON.stringify(info)}`);
    const { response } = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      title: 'Update ready',
      message: 'A new version has been downloaded. Restart the app to apply it now?',
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });

  autoUpdater.checkForUpdatesAndNotify();
}

app.whenReady().then(() => {
  createWindow();
  if (!isDev) setupAutoUpdate();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
