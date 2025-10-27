const api = require('./api');
const cfg = require('../config.json');

let pollTimer = null;
let lastFetch = [];

async function fetchOnce(token) {
  const msgs = await api.fetchChat(token);
  const bcasts = await api.fetchBroadcasts(token);
  // merge broadcasts (mark is_admin) + messages
  const all = (msgs || []).map(m => ({ pilot: m.user, text: m.text, time: m.time, is_admin: m.is_admin || false }))
    .concat((bcasts || []).map(b => ({ pilot: 'ADMIN', text: b.text, time: b.time, is_admin: true })));
  return all;
}

function startPolling(token, onUpdate) {
  if (pollTimer) clearInterval(pollTimer);
  async function tick() {
    const arr = await fetchOnce(token);
    // simple change detection
    const key = JSON.stringify(arr);
    if (key !== JSON.stringify(lastFetch)) {
      lastFetch = arr;
      onUpdate(arr);
    }
  }
  // initial
  tick();
  pollTimer = setInterval(tick, cfg.chatPollSec * 1000);
}

async function sendMessage(apiKey, text) {
  return await api.sendChat(apiKey, text);
}

module.exports = { startPolling, sendMessage, fetchOnce };
