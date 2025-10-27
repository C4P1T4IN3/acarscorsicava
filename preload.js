// ==========================================
// ACARS Air Corsica Virtuel — preload.js
// Pont sécurisé entre Renderer et Main (Electron 28+)
// ==========================================

const { contextBridge, ipcRenderer } = require("electron");

// =========================================================
// Sécurité : le preload agit comme un pont contrôlé
// Rien d’autre que ce qui est explicitement exposé n’est accessible
// =========================================================

contextBridge.exposeInMainWorld("electronAPI", {
  // ===========================
  // 🔄 Gestion des mises à jour
  // ===========================

  /**
   * Demande à Electron de télécharger une mise à jour depuis GitHub
   */
  downloadUpdate: () => ipcRenderer.invoke("download-update"),

  /**
   * Installe la mise à jour téléchargée et redémarre l’application
   */
  installUpdate: () => ipcRenderer.invoke("install-update"),

  // ===========================
  // 🔐 Authentification utilisateur
  // ===========================

  /**
   * Efface le token local et envoie l’événement de déconnexion
   */
  logout: () => ipcRenderer.send("logout"),

  /**
   * Récupère le token stocké dans le store (côté main)
   */
  getStoredToken: () => ipcRenderer.invoke("get-stored-token"),

  // ===========================
  // 🛰️ Bridge de communication SimConnect / données
  // ===========================

  /**
   * Écoute tous les messages envoyés depuis le main process (données du bridge, MAJ, etc.)
   * @param {Function} callback
   */
  onBridgeData: (callback) => {
    ipcRenderer.on("bridge-data", (_, data) => {
      try {
        callback(data);
      } catch (err) {
        console.error("Erreur callback bridge-data :", err);
      }
    });
  },

  // ===========================
  // 🧰 Utilitaires (log, debug)
  // ===========================

  /**
   * Envoi d’un message de log vers le process principal
   * (utile si tu veux logger des choses depuis le renderer)
   */
  log: (msg) => ipcRenderer.send("renderer-log", msg),
});

// =========================================================
// Gestion d’erreurs générales pour éviter les crashs Renderer
// =========================================================
window.addEventListener("error", (e) => {
  console.error("❌ Erreur Renderer non capturée :", e.message);
});

window.addEventListener("unhandledrejection", (e) => {
  console.error("❌ Promise rejetée sans catch :", e.reason);
});
