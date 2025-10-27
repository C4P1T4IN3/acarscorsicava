// ===================================
// ACARS Air Corsica Virtuel - bridge.js
// Gestion de la communication avec le Bridge (SimConnect / X-Plane)
// ===================================

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

let bridgeProcess = null;
let wsClient = null;
let watchdog = null;

// =============================
// Lancer le bridge local
// =============================
function startBridge(basePath, onMessage) {
  try {
    const exePath = path.join(basePath, 'bridge', 'ACARS_AirCorsica.exe');
    if (!fs.existsSync(exePath)) {
      console.warn('⚠️ Bridge introuvable à :', exePath);
      return;
    }

    console.log('🛰️ Lancement du bridge SimConnect/X-Plane...');
    bridgeProcess = spawn(exePath, [], { detached: true, stdio: 'ignore' });
    bridgeProcess.unref();

    // Attendre que le serveur local WS démarre
    setTimeout(() => connectBridge(onMessage), 3000);
  } catch (err) {
    console.error('❌ Erreur lors du lancement du bridge :', err);
  }
}

// =============================
// Connexion WebSocket au bridge
// =============================
function connectBridge(onMessage) {
  try {
    wsClient = new WebSocket('ws://127.0.0.1:32123');

    wsClient.on('open', () => {
      console.log('✅ Connecté au bridge local SimConnect/X-Plane');
    });

    wsClient.on('message', (data) => {
      try {
        const json = JSON.parse(data);
        if (typeof onMessage === 'function') onMessage(json);
      } catch (e) {
        console.warn('⚠️ Données bridge invalides :', e.message);
      }
    });

    wsClient.on('close', () => {
      console.warn('🔌 Connexion au bridge fermée, tentative de reconnexion...');
      reconnectBridge(onMessage);
    });

    wsClient.on('error', (err) => {
      console.error('❌ Erreur bridge :', err.message);
      reconnectBridge(onMessage);
    });
  } catch (e) {
    console.error('❌ Impossible de se connecter au bridge :', e.message);
  }
}

// =============================
// Reconnexion automatique
// =============================
function reconnectBridge(onMessage) {
  if (watchdog) clearTimeout(watchdog);
  watchdog = setTimeout(() => connectBridge(onMessage), 5000);
}

// =============================
// Arrêter le bridge
// =============================
function stopBridge() {
  try {
    if (watchdog) clearTimeout(watchdog);
    if (wsClient) {
      wsClient.close();
      wsClient = null;
    }
    if (bridgeProcess && !bridgeProcess.killed) {
      console.log('🛑 Arrêt du processus bridge...');
      bridgeProcess.kill('SIGTERM');
      bridgeProcess = null;
    }
  } catch (err) {
    console.error('⚠️ Erreur lors de l’arrêt du bridge :', err);
  }
}

// =============================
// Export des fonctions
// =============================
module.exports = {
  startBridge,
  stopBridge
};
