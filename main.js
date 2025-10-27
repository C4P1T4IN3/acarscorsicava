// =============================
// ACARS Air Corsica Virtuel
// main.js (ESM)
// =============================

import { app, BrowserWindow, ipcMain } from 'electron';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import Store from 'electron-store';
import { spawn } from 'child_process';
import fs from 'fs';
import { autoUpdater } from 'electron-updater';
import * as auth from './modules/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow = null;
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
  preload: path.join(__dirname, 'preload.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: false
},
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Lancer le bridge et surveiller
  startSimBridge();
  startWatchdog();

  // Lancer la vérification de mise à jour
  setTimeout(() => checkForUpdates(), 5000);
}

// =============================
// Lancement du bridge simulateur
// =============================
function startSimBridge() {
  try {
    const bridgePath = path.join(__dirname, 'bridge', 'ACARS_AirCorsica.exe');
    if (fs.existsSync(bridgePath)) {
      console.log('🛰️ Lancement du bridge SimConnect/XPlane...');
      bridgeProcess = spawn(bridgePath, [], {
        detached: true,
        stdio: 'ignore',
      });
      bridgeProcess.unref();
    } else {
      console.warn('⚠️ Bridge introuvable :', bridgePath);
    }
  } catch (err) {
    console.error('❌ Erreur lors du lancement du bridge :', err);
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
// Gestion des mises à jour automatiques
// =============================
function checkForUpdates() {
  try {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    // Journalisation
    autoUpdater.logger = require('electron-log');
    autoUpdater.logger.transports.file.level = 'info';
    console.log('🔎 Vérification des mises à jour...');

    autoUpdater.on('update-available', (info) => {
      console.log(`🔔 Nouvelle mise à jour disponible (${info.version})`);
      if (mainWindow) {
        mainWindow.webContents.executeJavaScript(`
          Swal.fire({
            title: 'Mise à jour disponible',
            text: 'Une nouvelle version (${info.version}) est disponible. Voulez-vous la télécharger maintenant ?',
            icon: 'info',
            showCancelButton: true,
            confirmButtonText: 'Mettre à jour',
            cancelButtonText: 'Plus tard'
          }).then((result) => {
            if (result.isConfirmed) window.electronAPI.downloadUpdate();
          });
        `);
      }
    });

    autoUpdater.on('update-downloaded', () => {
      console.log('✅ Mise à jour téléchargée');
      if (mainWindow) {
        mainWindow.webContents.executeJavaScript(`
          Swal.fire({
            title: 'Mise à jour prête',
            text: 'L’application va redémarrer pour terminer la mise à jour.',
            icon: 'success'
          }).then(() => window.electronAPI.installUpdate());
        `);
      }
    });

    autoUpdater.on('error', (err) => {
      console.error('❌ Erreur AutoUpdater :', err);
    });

    autoUpdater.checkForUpdates();
  } catch (error) {
    console.error('Erreur pendant checkForUpdates:', error);
  }
}

ipcMain.handle('download-update', () => autoUpdater.downloadUpdate());
ipcMain.handle('install-update', () => autoUpdater.quitAndInstall());

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
