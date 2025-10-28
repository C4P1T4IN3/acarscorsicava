// =============================
// ACARS Air Corsica Virtuel
// main.js — Version finale stable avec AutoUpdater GitHub
// =============================

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const Store = require("electron-store");
const bridge = require("./modules/bridge.js");
const auth = require("./modules/auth.js");
const log = require("electron-log");

// =============================
// Initialisation du logger
// =============================
log.initialize({ preload: true });
log.transports.file.level = "info";
log.info("🛫 ACARS Air Corsica — Initialisation du logger");

// =============================
// Chargement du module electron-updater
// =============================
let autoUpdater;
try {
  autoUpdater = require("electron-updater").autoUpdater;
} catch (err) {
  const updater = require("electron-updater");
  autoUpdater = updater.autoUpdater || updater.default.autoUpdater;
  log.warn("⚠️ Fallback de electron-updater activé");
}

// =============================
// Variables globales
// =============================
let mainWindow = null;
const store = new Store();
let bridgeActive = false;

// =============================
// Configuration du logger
// =============================
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = "info";
log.info("🚀 ACARS Air Corsica Virtuel démarré");

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
  // mainWindow.webContents.openDevTools(); // 🔧 Debug

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // ✅ Démarrer le bridge simulateur
  try {
    bridge.startBridge(__dirname, (data) => {
      bridgeActive = true;
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send("bridge-data", data);
      }
    });
    log.info("✅ Bridge SimConnect démarré");
  } catch (e) {
    log.warn("⚠️ Bridge non disponible :", e.message);
  }

  // ✅ Vérifier les mises à jour après 5 secondes
  setTimeout(checkForUpdates, 5000);
}

// =============================
// 🔁 Vérification & gestion des mises à jour GitHub
// =============================
function checkForUpdates() {
  try {
    log.info("🔍 Vérification des mises à jour GitHub...");
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;
    autoUpdater.disableWebInstaller = true;
    autoUpdater.forceDevUpdateConfig = true;
    autoUpdater.allowDowngrade = true;

    autoUpdater.checkForUpdatesAndNotify();

    // --- Événements ---
    autoUpdater.on("checking-for-update", () => log.info("🛰️ Recherche de mise à jour..."));
    autoUpdater.on("update-not-available", () => log.info("ℹ️ Aucune mise à jour disponible."));
    autoUpdater.on("update-available", (info) => {
      log.info(`📦 Nouvelle version ${info.version} trouvée`);
      if (mainWindow) {
        mainWindow.webContents.send("bridge-data", {
          type: "update-available",
          version: info.version,
        });
      }
    });
    autoUpdater.on("download-progress", (progress) => {
      const percent = Math.round(progress.percent);
      log.info(`⬇️ Téléchargement en cours : ${percent}%`);
      if (mainWindow) {
        mainWindow.webContents.send("bridge-data", {
          type: "update-progress",
          percent,
        });
      }
    });
    autoUpdater.on("update-downloaded", (info) => {
      log.info(`✅ Mise à jour ${info.version} téléchargée`);
      if (mainWindow) {
        mainWindow.webContents.send("bridge-data", {
          type: "update-downloaded",
          version: info.version,
        });
      }
    });
    autoUpdater.on("error", (err) => {
      log.error("❌ Erreur AutoUpdater :", err.message);
      if (mainWindow) {
        mainWindow.webContents.send("bridge-data", {
          type: "update-error",
          message: err.message,
        });
      }
    });
  } catch (error) {
    log.error("Erreur checkForUpdates :", error);
  }
}


// =============================
// 🧩 IPC : gestion des actions depuis renderer
// =============================
ipcMain.handle("download-update", async () => {
  try {
    log.info("⏬ Téléchargement manuel de la mise à jour...");
    await autoUpdater.downloadUpdate();
  } catch (e) {
    log.error("Erreur téléchargement MAJ :", e.message);
  }
});

ipcMain.handle("install-update", async () => {
  try {
    log.info("🔧 Installation de la mise à jour...");
    autoUpdater.quitAndInstall();
  } catch (e) {
    log.error("Erreur installation MAJ :", e.message);
  }
});

// 🔐 Authentification utilisateur
ipcMain.handle("get-stored-token", () => auth.getToken());
ipcMain.on("save-token", (event, token) => {
  log.info("🔑 Token sauvegardé");
  auth.saveKey(token);
});
ipcMain.on("logout", (event) => {
  auth.clearKey();
  event.reply("logged-out");
  log.info("🚪 Déconnexion effectuée");
});

// =============================
// 🪄 Gestion des erreurs globales
// =============================
process.on("uncaughtException", (err) => {
  log.error("❌ Exception non gérée :", err);
});
process.on("unhandledRejection", (reason) => {
  log.error("❌ Promise rejetée sans catch :", reason);
});

// =============================
// 🧠 Cycle de vie Electron
// =============================
app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  log.info("🧹 Fermeture des fenêtres...");
  try {
    if (bridge && typeof bridge.stopBridge === "function") {
      bridge.stopBridge();
      bridgeActive = false;
      log.info("🛑 Bridge arrêté proprement");
    }
  } catch (e) {
    log.warn("⚠️ Erreur lors de la fermeture du bridge :", e.message);
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
  log.info("🛑 Fermeture complète d’ACARS...");
  try {
    if (bridgeActive && bridge && typeof bridge.stopBridge === "function") {
      bridge.stopBridge();
      bridgeActive = false;
    }
  } catch (e) {
    log.error("Erreur pendant la fermeture :", e.message);
  }
});
