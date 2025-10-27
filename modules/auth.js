// ===================================
// ACARS Air Corsica Virtuel - Auth.js
// Gestion de la clé API du pilote
// ===================================

import Store from 'electron-store';
const store = new Store();

export function saveKey(apiKey) {
  if (!apiKey) return;
  store.set('apiKey', apiKey);
  console.log('🔑 Clé API enregistrée localement');
}

export function getToken() {
  const key = store.get('apiKey', null);
  if (key) console.log('🔑 Clé API trouvée');
  return key;
}

export function clearKey() {
  store.delete('apiKey');
  console.log('🧹 Clé API supprimée');
}
