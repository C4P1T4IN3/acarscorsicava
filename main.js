// =============================
// ACARS Air Corsica Virtuel
// main.js — version stable (Electron + AutoUpdater)
// =============================

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const Store = require("electron-store");
const bridge = require("./modules/bridge.js");
const auth = require("./modules/auth.js");

// =============================
// Chargement sécurisé du module electron-updater
// =============================
let autoUpdater;
try {
  autoUpdater = require("electron-updater").autoUpdater;
} catch (err) {
  const updater = require("electron-updater");
  autoUpdater = updater.autoUpdater || updater.default.autoUpdater;
}

// =============================
// Variables globales
// =============================
let mainWindow = null;
const store = new Store();

// =============================
// Création de la fenêtre principale
// =============================
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 650,
    icon: path.join(__dirname, "assets", "logo.ico"),
    backgroundColor: "#111217",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
  // mainWindow.webContents.openDevTools(); // 🔧 debug uniquement

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // ✅ Démarrer le bridge simulateur (si disponible)
  try {
    bridge.startBridge(__dirname, (data) => {
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send("bridge-data", data);
      }
    });
  } catch (e) {
    console.warn("⚠️ Impossible de démarrer le bridge:", e.message);
  }

  // ✅ Vérifier les mises à jour après 5 secondes
  setTimeout(checkForUpdates, 5000);
}

// =============================
// 🔁 Vérification & gestion des mises à jour GitHub
// =============================
function checkForUpdates() {
  try {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;

    console.log("🔍 Vérification des mises à jour GitHub...");
    autoUpdater.checkForUpdates();

    // 🔹 Quand une mise à jour est trouvée
    autoUpdater.on("update-available", (info) => {
      console.log(`📦 Nouvelle version ${info.version} trouvée`);
      if (mainWindow) {
        mainWindow.webContents.send("bridge-data", {
          type: "update-available",
          version: info.version,
        });
      }
    });

    // 🔹 Quand la mise à jour est téléchargée
    autoUpdater.on("update-downloaded", () => {
      console.log("✅ Mise à jour téléchargée, prête à installer");
      if (mainWindow) {
        mainWindow.webContents.send("bridge-data", {
          type: "update-downloaded",
        });
      }
    });

    // 🔹 Erreur
    autoUpdater.on("error", (err) => {
      console.error("❌ Erreur AutoUpdater:", err.message);
      if (mainWindow) {
        mainWindow.webContents.send("bridge-data", {
          type: "update-error",
          message: err.message,
        });
      }
    });
  } catch (error) {
    console.error("Erreur pendant checkForUpdates:", error);
  }
}

// =============================
// ⚙️ IPC: mise à jour, auth & logout
// =============================
ipcMain.handle("download-update", async () => {
  try {
    await autoUpdater.downloadUpdate();
  } catch (e) {
    console.error("Erreur téléchargement MAJ:", e.message);
  }
});

ipcMain.handle("install-update", async () => {
  try {
    autoUpdater.quitAndInstall();
  } catch (e) {
    console.error("Erreur installation MAJ:", e.message);
  }
});

// Authentification utilisateur locale
ipcMain.handle("get-stored-token", () => auth.getToken());
ipcMain.on("save-token", (event, token) => auth.saveKey(token));
ipcMain.on("logout", (event) => {
  auth.clearKey();
  event.reply("logged-out");
});

// =============================
// 🧩 Cycle de vie Electron
// =============================
app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  try {
    if (bridge && typeof bridge.stopBridge === "function") bridge.stopBridge();
  } catch (e) {
    console.warn("⚠️ Erreur à la fermeture du bridge:", e.message);
  }
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// =============================
// 🧹 Fermeture propre (support NSIS)
// =============================
app.on("before-quit", () => {
  console.log("🛑 Fermeture d’ACARS...");
  try {
    if (bridge && typeof bridge.stopBridge === "function") {
      bridge.stopBridge();
    }
  } catch (e) {
    console.error("Erreur pendant la fermeture:", e.message);
  }
});
