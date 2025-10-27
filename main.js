// =============================
// ACARS Air Corsica Virtuel
// main.js (ESM compatible CommonJS imports)
// =============================

import { app, BrowserWindow, ipcMain } from 'electron';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import Store from 'electron-store';
import { spawn } from 'child_process';
import fs from 'fs';
import * as auth from './modules/auth.js';

// Charger electron-updater dynamiquement (CJS)
let autoUpdater = null;
(async () => {
  const pkg = await import('electron-updater');
  autoUpdater = pkg.autoUpdater;
})();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow;
let bridgeProcess = null;
let watchdogInterval = null;
const store = new Store();

// =============================
// Création de la fenêtre principale
// =============================
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(__dirname, 'assets', 'logo.ico'),
    backgroundColor: '#111217',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.on('closed', () => (mainWindow = null));

  startSimBridge();
  startWatchdog();
  setTimeout(checkForUpdates, 5000); // Attendre 5 sec pour laisser Electron se stabiliser
}

// =============================
// Lancement du bridge simulateur
// =============================
function startSimBridge() {
  try {
    const bridgePath = path.join(__dirname, 'bridge', 'ACARS_AirCorsica.exe');
    if (fs.existsSync(bridgePath)) {
      console.log('🛰️ Lancement du bridge SimConnect/XPlane...');
      bridgeProcess = spawn(bridgePath, [], { detached: true, stdio: 'ignore' });
      bridgeProcess.unref();
    } else console.warn('⚠️ Bridge introuvable :', bridgePath);
  } catch (err) {
    console.error('❌ Erreur bridge :', err);
  }
}

function startWatchdog() {
  if (watchdogInterval) clearInterval(watchdogInterval);
  watchdogInterval = setInterval(() => {
    if (!bridgeProcess || bridgeProcess.killed) {
      console.warn('⚠️ Bridge arrêté, redémarrage...');
      startSimBridge();
    }
  }, 8000);
}

function stopSimBridge() {
  try {
    clearInterval(watchdogInterval);
    if (bridgeProcess && !bridgeProcess.killed) {
      console.log('🛑 Arrêt du bridge...');
      bridgeProcess.kill('SIGTERM');
    }
  } catch (err) {
    console.error('⚠️ Impossible d’arrêter le bridge :', err);
  }
}

// =============================
// Gestion des mises à jour
// =============================
async function checkForUpdates() {
  try {
    if (!autoUpdater) {
      console.warn('⏳ autoUpdater non encore chargé, nouvel essai dans 3s...');
      setTimeout(checkForUpdates, 3000);
      return;
    }

    autoUpdater.autoDownload = false;

    autoUpdater.on('update-available', () => {
      console.log('🔔 Nouvelle mise à jour disponible');
      mainWindow.webContents.executeJavaScript(`
        Swal.fire({
          title: 'Mise à jour disponible',
          text: 'Une nouvelle version d’ACARS est disponible. Voulez-vous la télécharger maintenant ?',
          icon: 'info',
          showCancelButton: true,
          confirmButtonText: 'Mettre à jour',
          cancelButtonText: 'Plus tard'
        }).then((result) => {
          if (result.isConfirmed) {
            window.electronAPI.downloadUpdate();
          }
        });
      `);
    });

    autoUpdater.on('update-downloaded', () => {
      console.log('✅ Mise à jour téléchargée');
      mainWindow.webContents.executeJavaScript(`
        Swal.fire({
          title: 'Mise à jour prête',
          text: 'L’application va redémarrer pour terminer la mise à jour.',
          icon: 'success'
        }).then(() => {
          window.electronAPI.installUpdate();
        });
      `);
    });

    autoUpdater.checkForUpdates();
  } catch (error) {
    console.error('Erreur AutoUpdater:', error);
  }
}

ipcMain.handle('download-update', () => autoUpdater?.downloadUpdate());
ipcMain.handle('install-update', () => autoUpdater?.quitAndInstall());

// =============================
// IPC Authentification
// =============================
ipcMain.handle('get-stored-token', () => auth.getToken());
ipcMain.on('save-token', (event, token) => auth.saveKey(token));
ipcMain.on('logout', (event) => {
  auth.clearKey();
  event.reply('logged-out');
});

// =============================
// Gestion Electron
// =============================
app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  stopSimBridge();
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on('before-quit', stopSimBridge);
