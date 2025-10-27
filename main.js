const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store'); // ✅ Import normal (CommonJS)
const { autoUpdater } = require('electron-updater'); // ✅ Import normal
const auth = require('./modules/auth.js');
const bridge = require('./modules/bridge.js');

let mainWindow = null;
let store = new Store(); // ✅ Instance unique de store
(async () => {
  const mod = await import('electron-store');
  Store = mod.default;
  store = new Store();
})();

let mainWindow = null;

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
      contextIsolation: false,
      nodeIntegration: true,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // ✅ Lancer le bridge simulateur
  bridge.startBridge(__dirname, (data) => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('bridge-data', data);
    }
  });

  // ✅ Vérifier les mises à jour après 5 secondes
  setTimeout(checkForUpdates, 5000);
}

// =============================
// Mises à jour automatiques
// =============================
function checkForUpdates() {
  try {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', () => {
      console.log('🔔 Nouvelle mise à jour disponible');
      if (mainWindow) {
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
          }).then(() => {
            window.electronAPI.installUpdate();
          });
        `);
      }
    });

    autoUpdater.on('error', (err) => {
      console.error('❌ Erreur AutoUpdater :', err);
    });

    console.log('🔎 Vérification des mises à jour...');
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
  bridge.stopBridge(); // ✅ ferme proprement le bridge
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
  bridge.stopBridge();
});
