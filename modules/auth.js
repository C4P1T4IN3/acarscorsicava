// ===================================
// ACARS Air Corsica Virtuel - auth.js
// Gestion de la clé API du pilote (CommonJS)
// ===================================

const Store = require('electron-store');
const store = new Store();

/**
 * Enregistre la clé API localement
 * @param {string} apiKey
 */
function saveKey(apiKey) {
  if (!apiKey) return;
  store.set('apiKey', apiKey);
  console.log('🔑 Clé API enregistrée localement');
}

/**
 * Récupère la clé API sauvegardée
 * @returns {string|null}
 */
function getToken() {
  const key = store.get('apiKey', null);
  if (key) console.log('🔑 Clé API trouvée');
  return key;
}

/**
 * Supprime la clé API stockée
 */
function clearKey() {
  store.delete('apiKey');
  console.log('🧹 Clé API supprimée');
}

// Exporte les fonctions pour main.js
module.exports = { saveKey, getToken, clearKey };
