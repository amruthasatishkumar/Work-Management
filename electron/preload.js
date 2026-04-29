'use strict';

/**
 * Preload script — runs in a privileged context before the renderer.
 *
 * Security settings (set in BrowserWindow):
 *   contextIsolation: true   — renderer cannot access Node globals
 *   nodeIntegration:  false  — renderer has no require()
 *   sandbox:          true   — extra OS-level sandbox
 *
 * Only expose what the frontend actually needs via contextBridge.
 * The frontend communicates with the Express backend over HTTP (/api/*),
 * so almost nothing needs to be bridged here.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /** Returns the Electron app version string */
  getVersion: () => ipcRenderer.invoke('app:version'),
  /** Returns OneDrive backup status: { connected, backupDir, lastBackup } */
  getBackupStatus: () => ipcRenderer.invoke('backup:status'),
  /** Opens a D365 URL in the system browser */
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  /** Subscribe to auto-update status events from the main process */
  onUpdateStatus: (cb) => ipcRenderer.on('update:status', (_e, data) => cb(data)),
  /** Quit and install the downloaded update */
  installUpdate: () => ipcRenderer.invoke('update:install'),
  /** Manually trigger an update check */
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
});
