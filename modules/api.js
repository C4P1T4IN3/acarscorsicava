const axios = require('axios');
const cfg = require('../config.json');

function getHeaders(apiKey) {
  return { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' };
}

async function sendTrack(apiKey, data) {
  try {
    // endpoint configurable ; par défaut on essaye acars/update
    const url = cfg.apiBase + cfg.acarsEndpoint;
    await axios.post(url, data, { headers: getHeaders(apiKey) });
    console.log('📡 Envoi ACARS OK');
  } catch (err) {
    // log non-bloquant
    console.warn('[ACARS API] Erreur:', err.response ? err.response.data : err.message);
  }
}

async function sendChat(apiKey, text) {
  try {
    const url = cfg.apiBase + cfg.chatSendEndpoint;
    await axios.post(url, { text }, { headers: getHeaders(apiKey) });
    return true;
  } catch (err) {
    console.warn('[CHAT API] Erreur:', err.response ? err.response.data : err.message);
    return false;
  }
}

async function fetchChat(apiKey) {
  try {
    const url = cfg.apiBase + cfg.chatGetEndpoint;
    const res = await axios.get(url, { headers: getHeaders(apiKey) });
    return res.data || [];
  } catch (err) {
    return [];
  }
}

async function fetchBroadcasts(apiKey) {
  try {
    const url = cfg.apiBase + cfg.broadcastsEndpoint;
    const res = await axios.get(url, { headers: getHeaders(apiKey) });
    return res.data || [];
  } catch {
    return [];
  }
}

module.exports = { sendTrack, sendChat, fetchChat, fetchBroadcasts };
