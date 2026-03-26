'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

const isDev = process.env.ELECTRON_DEV === 'true';

// ─── Security: restrict which URLs Electron will navigate to ─────────────────
const ALLOWED_ORIGINS = [
  'http://localhost:3001',
  'http://localhost:5173',
];

// ─── State ────────────────────────────────────────────────────────────────────
let mainWindow = null;
let loadingWindow = null;
let activeDbPath = null; // set after auth so backup hooks can reference it
let startupComplete = false; // set true once main window is created; prevents premature quit during startup

// ─────────────────────────────────────────────────────────────────────────────
// OneDrive backup helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns the OneDrive backup folder, or null if OneDrive isn't available. */
function getOneDriveBackupDir() {
  const oneDriveRoot = process.env.OneDriveCommercial || process.env.OneDrive;
  if (!oneDriveRoot) return null;
  return path.join(oneDriveRoot, 'Work Management Backup');
}

/**
 * Copies the active DB to OneDrive:
 *   • work-management-latest.db  — always overwritten for easy restore
 *   • work-management-YYYY-MM-DD.db — one daily snapshot kept for history
 */
function backupToOneDrive(dbPath) {
  const backupDir = getOneDriveBackupDir();
  if (!backupDir || !fs.existsSync(dbPath)) return;
  try {
    fs.mkdirSync(backupDir, { recursive: true });
    fs.copyFileSync(dbPath, path.join(backupDir, 'work-management-latest.db'));
    const today = new Date().toISOString().split('T')[0];
    const dailyPath = path.join(backupDir, `work-management-${today}.db`);
    if (!fs.existsSync(dailyPath)) {
      fs.copyFileSync(dbPath, dailyPath);
    }
    console.log('[backup] DB backed up to OneDrive:', backupDir);
  } catch (err) {
    // Non-fatal — don't block quit if backup fails
    console.error('[backup] OneDrive backup failed:', err.message);
  }
}

/**
 * If local DB is missing but a OneDrive backup exists, restore it automatically.
 * Returns true if a restore was performed.
 */
function restoreFromOneDriveIfNeeded(dbPath) {
  if (fs.existsSync(dbPath)) return false;
  const backupDir = getOneDriveBackupDir();
  if (!backupDir) return false;
  const latestBackup = path.join(backupDir, 'work-management-latest.db');
  if (!fs.existsSync(latestBackup)) return false;
  try {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.copyFileSync(latestBackup, dbPath);
    console.log('[backup] Restored DB from OneDrive backup:', latestBackup);
    return true;
  } catch (err) {
    console.error('[backup] Restore from OneDrive failed:', err.message);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading / splash window
// ─────────────────────────────────────────────────────────────────────────────
function createLoadingWindow() {
  loadingWindow = new BrowserWindow({
    width: 420,
    height: 320,
    frame: false,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    transparent: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  loadingWindow.loadFile(path.join(__dirname, 'loading.html'));
  return loadingWindow;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main application window
// ─────────────────────────────────────────────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    title: 'SE Work Manager',
    show: false, // wait until ready-to-show
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // sandbox: false — required for direct Chromium networking.
      // When sandbox:true, renderer network requests are proxied through the
      // Electron main process which cannot resolve microsoft.crm.dynamics.com
      // (no corporate PAC proxy). With sandbox:false the renderer uses Chromium's
      // own networking stack which reads the Windows PAC config — same as MSX Helper.
      sandbox: false,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Show window only when content is ready (no white flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (loadingWindow && !loadingWindow.isDestroyed()) {
      loadingWindow.close();
    }
  });

  // Security: block navigation to any URL outside our allowed origins
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isAllowed = ALLOWED_ORIGINS.some(o => url.startsWith(o));
    if (!isAllowed) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Security: block all new-window / popup requests from the renderer
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Open external links in the system browser instead
    shell.openExternal(url);
    return { action: 'deny' };
  });

  const appUrl = isDev ? 'http://localhost:5173' : 'http://localhost:3001';
  mainWindow.loadURL(appUrl);

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─────────────────────────────────────────────────────────────────────────────
// Token prompt window — collects GitHub PAT on first launch
// Returns a Promise that resolves to { token: string | null }
// ─────────────────────────────────────────────────────────────────────────────
function promptForGitHubToken() {
  return new Promise((resolve) => {
    const tokenWin = new BrowserWindow({
      width: 500,
      height: 460,
      resizable: false,
      center: true,
      title: 'AI Assistant Setup',
      webPreferences: {
        contextIsolation: false, // needed to use require('electron') in the HTML's inline script
        nodeIntegration: true,
        sandbox: false,
      },
    });

    tokenWin.loadFile(path.join(__dirname, 'token-prompt.html'));
    tokenWin.setMenuBarVisibility(false);

    ipcMain.once('token-prompt:save', (_event, token) => {
      tokenWin.close();
      resolve({ token });
    });

    ipcMain.once('token-prompt:skip', () => {
      tokenWin.close();
      resolve({ token: null });
    });

    tokenWin.on('closed', () => resolve({ token: null }));
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Config helpers — persist GitHub token and other local settings
// ─────────────────────────────────────────────────────────────────────────────
function loadConfig(userDataPath) {
  const configPath = path.join(userDataPath, 'config.json');
  if (fs.existsSync(configPath)) {
    try { return JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch { /* ignore */ }
  }
  return {};
}

function saveConfig(userDataPath, config) {
  const configPath = path.join(userDataPath, 'config.json');
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

// ─────────────────────────────────────────────────────────────────────────────
// Embedded Express backend
// In production the backend is bundled inside the app — we require() it which
// starts the server as a side effect. The DB_PATH and PORT env vars must be
// set before this call.
// ─────────────────────────────────────────────────────────────────────────────
async function startEmbeddedBackend(dbPath) {
  process.env.DB_PATH = dbPath;
  process.env.PORT = '3001';
  process.env.NODE_ENV = 'production';

  // Require the compiled backend entrypoint — starts Express automatically
  require(path.join(__dirname, '..', 'work-management', 'backend', 'dist', 'index.js'));

  // Give Express a moment to bind before we open the window
  await new Promise(r => setTimeout(r, 1000));
}

// ─────────────────────────────────────────────────────────────────────────────
// IPC handlers
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.handle('app:version', () => app.getVersion());

ipcMain.handle('shell:openExternal', (_event, url) => {
  // Only allow https URLs pointing to known safe domains
  const allowed = ['https://microsoftsales.crm.dynamics.com'];
  if (allowed.some(origin => url.startsWith(origin))) {
    shell.openExternal(url);
  }
});

ipcMain.handle('backup:status', () => {
  const backupDir = getOneDriveBackupDir();
  const connected = !!backupDir;
  let lastBackup = null;
  if (backupDir) {
    const latestPath = path.join(backupDir, 'work-management-latest.db');
    if (fs.existsSync(latestPath)) {
      lastBackup = fs.statSync(latestPath).mtime.toISOString();
    }
  }
  return { connected, backupDir, lastBackup };
});

ipcMain.handle('update:install', () => {
  autoUpdater.quitAndInstall();
});

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  await app.whenReady();

  const userDataPath = app.getPath('userData');
  const logFile = path.join(userDataPath, 'startup.log');
  const log = (msg) => {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFileSync(logFile, line);
    console.log(msg);
  };

  log('main() started, userDataPath=' + userDataPath);

  // 1. Show splash screen immediately
  createLoadingWindow();
  log('step1: loading window created');

  try {
    // 2. Authenticate with Microsoft (org-restricted via Entra ID)
    let user;
    if (isDev) {
      user = { userId: 'dev-user', displayName: 'Developer', email: 'dev@localhost' };
    } else {
      log('step2: starting auth');
      const { createAuthService } = require('./services/auth');
      const authService = createAuthService(userDataPath, (url) => shell.openExternal(url));
      user = await authService.signIn();
      log('step2: auth done, user=' + user.userId);
    }

    // 3. Determine per-user SQLite DB path
    const dbPath = path.join(userDataPath, `${user.userId}.db`);
    restoreFromOneDriveIfNeeded(dbPath);
    activeDbPath = dbPath;
    log('step3: dbPath=' + dbPath);

    // 4. Check for GitHub token (AI assistant)
    if (loadingWindow && !loadingWindow.isDestroyed()) {
      loadingWindow.close();
      loadingWindow = null;
    }
    log('step4: checking github token');
    const config = loadConfig(userDataPath);
    if (!config.githubToken) {
      const { token } = await promptForGitHubToken();
      if (token) {
        config.githubToken = token;
        saveConfig(userDataPath, config);
      }
    }
    if (config.githubToken) {
      process.env.GITHUB_TOKEN = config.githubToken;
    }
    log('step4: github token done');

    // 5. Start the embedded Express backend (production only)
    if (!isDev) {
      log('step5: starting backend');
      await startEmbeddedBackend(dbPath);
      log('step5: backend started');
    } else {
      process.env.DB_PATH = dbPath;
    }

    // 6. Open the main application window
    log('step6: creating main window');
    createMainWindow();
    startupComplete = true; // from here on, window-all-closed should quit normally
    log('step6: main window created');

    // 7. Check for updates (production only)
    // Wait for the renderer to finish loading before checking so that the
    // update:status IPC listener is registered before any events fire.
    if (!isDev) {
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.logger = { info: log, warn: log, error: log, debug: () => {} };

      // Cache status in case events fire before the renderer re-registers
      // (e.g. after a hot-reload or navigation). Re-send on every new load.
      let lastUpdateStatus = null;

      const sendStatus = (data) => {
        lastUpdateStatus = data;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('update:status', data);
        }
      };

      // Re-send the last known status whenever the renderer reloads
      mainWindow.webContents.on('did-finish-load', () => {
        if (lastUpdateStatus) {
          mainWindow.webContents.send('update:status', lastUpdateStatus);
        }
      });

      autoUpdater.on('update-available', (info) => {
        sendStatus({ status: 'available', version: info.version });
      });
      autoUpdater.on('download-progress', (p) => {
        sendStatus({ status: 'downloading', percent: Math.round(p.percent) });
      });
      autoUpdater.on('update-downloaded', () => {
        sendStatus({ status: 'downloaded' });
      });
      autoUpdater.on('error', (err) => {
        log('auto-updater error: ' + (err && err.message ? err.message : String(err)));
      });

      // Delay check until renderer is ready to receive IPC messages
      mainWindow.webContents.once('did-finish-load', () => {
        autoUpdater.checkForUpdates().catch((err) => {
          log('checkForUpdates failed: ' + (err && err.message ? err.message : String(err)));
        });
      });
    }

  } catch (err) {
    const errMsg = err && err.message ? err.message : String(err);
    const stack = err && err.stack ? err.stack : errMsg;
    try { fs.appendFileSync(path.join(app.getPath('userData'), 'startup.log'), `[${new Date().toISOString()}] CATCH: ${stack}\n`); } catch {}
    if (loadingWindow && !loadingWindow.isDestroyed()) {
      loadingWindow.close();
      loadingWindow = null;
    }
    const { response } = await dialog.showMessageBox({
      type: 'error',
      title: 'SE Work Manager — Sign-in Failed',
      message: 'Could not sign in to your Microsoft account.',
      detail: [
        'This is usually caused by one of the following:',
        '',
        '  • You are not connected to the corporate VPN',
        '  • Sign-in was cancelled in the browser',
        '  • Your session expired — please try again',
        '',
        `Detail: ${errMsg}`,
      ].join('\n'),
      buttons: ['Try Again', 'Quit'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) {
      // Retry — restart the whole startup flow
      main();
    } else {
      app.quit();
    }
  }
}

app.on('before-quit', () => {
  if (activeDbPath) backupToOneDrive(activeDbPath);
});

app.on('window-all-closed', () => {
  // During startup, there is a window-less gap between step4 (loading window closed)
  // and step6 (main window created). Without this guard, Electron quits here, killing
  // the process before the main window can be shown.
  if (!startupComplete) return;
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createMainWindow();
});

// ─── Global crash handler — shows a persistent dialog with full error details ─
function showFatalError(err) {
  const msg = err && err.stack ? err.stack : String(err);
  // Write to a log file so it's readable even if the dialog is missed
  try {
    const logPath = path.join(app.getPath('userData'), 'crash.log');
    const line = `[${new Date().toISOString()}] ${msg}\n\n`;
    fs.appendFileSync(logPath, line, 'utf-8');
  } catch { /* ignore log write failure */ }

  dialog.showMessageBoxSync({
    type: 'error',
    title: 'SE Work Manager — Crashed',
    message: 'An unexpected error occurred.',
    detail: msg.slice(0, 2000), // dialog has character limit
    buttons: ['OK'],
  });
  app.exit(1);
}

process.on('uncaughtException', (err) => {
  if (isUpdaterError(err)) return; // electron-updater errors are non-fatal
  showFatalError(err);
});
process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  if (isUpdaterError(err)) return; // electron-updater errors are non-fatal
  showFatalError(err);
});

function isUpdaterError(err) {
  const text = (err && err.stack) ? err.stack : String(err);
  return text.includes('electron-updater') ||
         text.includes('builder-util-runtime') ||
         (err && err.message && err.message.startsWith('Cannot download'));
}

main();
