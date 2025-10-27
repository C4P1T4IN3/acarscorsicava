// =============================
// ACARS Air Corsica Virtuel
// preload.js — Pont sécurisé entre le renderer et main
// =============================

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 🔄 Gestion des mises à jour
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),

  // 🔑 Authentification / stockage
  getStoredToken: () => ipcRenderer.invoke('get-stored-token'),
  saveToken: (token) => ipcRenderer.send('save-token', token),
  logout: () => ipcRenderer.send('logout'),

  // 📬 Gestion des réponses
  onLogout: (callback) => ipcRenderer.on('logged-out', callback)
});
