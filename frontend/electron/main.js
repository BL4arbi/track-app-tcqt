import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendFileSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import electronUpdater from 'electron-updater';
const { autoUpdater } = electronUpdater;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

ipcMain.handle('generate-sw-preview', async (_event, nativeFilePath) => {
  const { generateSolidWorksPreview } = await import('./solidworksPreview.js');
  return generateSolidWorksPreview(nativeFilePath);
});

// "Remember me" session persistence via the main process's own filesystem
// access, not browser localStorage — localStorage under a packaged app's
// file:// origin is not reliably persistent across restarts/updates in all
// Chromium configurations, which is what "have to log in every time" was.
// This writes a plain JSON file in userData, same reliable mechanism as
// the update log.
const sessionFilePath = path.join(app.getPath('userData'), 'session.json');

ipcMain.handle('get-session', () => {
  try {
    if (existsSync(sessionFilePath)) {
      return JSON.parse(readFileSync(sessionFilePath, 'utf8'));
    }
  } catch {
    // corrupt/unreadable file — treat as no session
  }
  return null;
});

ipcMain.handle('set-session', (_event, data) => {
  try {
    writeFileSync(sessionFilePath, JSON.stringify(data));
  } catch {
    // best-effort — worst case the user has to log in again
  }
});

ipcMain.handle('clear-session', () => {
  try {
    if (existsSync(sessionFilePath)) unlinkSync(sessionFilePath);
  } catch {
    // best-effort
  }
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
  Menu.setApplicationMenu(null);
  createWindow();
  if (!isDev) setupAutoUpdate();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
