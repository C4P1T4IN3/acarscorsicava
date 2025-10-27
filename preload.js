// ==========================================
// preload.js — Pont sécurisé pour Electron
// ==========================================
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // --- Gestion des mises à jour ---
  downloadUpdate: () => ipcRenderer.invoke("download-update"),
  installUpdate: () => ipcRenderer.invoke("install-update"),

  // --- Authentification ---
  logout: () => ipcRenderer.send("logout"),

  // --- Données du bridge ---
  onBridgeData: (callback) =>
    ipcRenderer.on("bridge-data", (_, data) => callback(data)),
});
