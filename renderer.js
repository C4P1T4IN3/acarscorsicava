// ==============================================
// ACARS Air Corsica Virtuel - Logique principale
// ==============================================

// Base API
const API_BASE = "https://crew.aircorsica-virtuel.fr/api_proxy.php?endpoint";

// =====================
// Éléments DOM
// =====================
const loginScreen = document.getElementById("loginScreen");
const mainApp = document.getElementById("mainApp");
const loginBtn = document.getElementById("loginBtn");
const apiKeyInput = document.getElementById("apiKeyInput");
const loginMsg = document.getElementById("loginMsg");
const sidebarItems = document.querySelectorAll(".menu-item");
const sendPirepBtn = document.getElementById("sendPirepBtn");
const pirepStatus = document.getElementById("pirepStatus");
const pilotName = document.getElementById("pilotName");
const chatPopup = document.getElementById("chatPopup");
const closeChatBtn = document.getElementById("closeChatBtn");
const sendChatBtn = document.getElementById("sendChatBtn");
const chatInput = document.getElementById("chatMessageInput");
const chatMessages = document.getElementById("chatMessages");
const logoutBtn = document.getElementById("logoutBtn");
const flightData = document.getElementById("flightData");

let apiKey = localStorage.getItem("apiKey");
let currentUser = null;
let currentFlight = null;
let dragging = false;
let offset = { x: 0, y: 0 };

const { ipcRenderer } = require('electron');
import Swal from 'sweetalert2';

// Lien renderer → main pour l'updater
window.electronAPI = {
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update')
};

// =====================
// Authentification API
// =====================
async function verifyApiKey(key) {
  try {
    const url = `${API_BASE}=user&api_key=${key}`;
    const res = await axios.get(url);
    const user = res.data.data || res.data.user || res.data;

    if (user && (user.id || user.name)) {
      currentUser = user;
      pilotName.textContent = user.name || user.ident || "Pilote";
      localStorage.setItem("apiKey", key);
      apiKey = key;
      showApp();
      startBridgeConnection();
      startChatPolling();
      return true;
    } else {
      loginMsg.textContent = "❌ Clé API invalide.";
      return false;
    }
  } catch (err) {
    loginMsg.textContent = "⚠️ Erreur API.";
    console.error("Erreur API:", err);
    return false;
  }
}

// =====================
// Gestion des écrans
// =====================
function showApp() {
  loginScreen.classList.remove("active");
  mainApp.classList.add("active");
}

// =====================
// Connexion bouton login
// =====================
loginBtn.addEventListener("click", async () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    loginMsg.textContent = "Entrez votre clé API.";
    return;
  }
  loginMsg.textContent = "Vérification...";
  await verifyApiKey(key);
});

// =====================
// Déconnexion
// =====================
logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("apiKey");
  location.reload();
});

// =====================
// Navigation sidebar
// =====================
sidebarItems.forEach(item => {
  item.addEventListener("click", () => {
    const section = item.getAttribute("data-section");
    if (!section) return;

    document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
    document.getElementById(section).classList.add("active");

    if (section === "chat") {
      chatPopup.classList.remove("hidden");
    }
  });
});

// =====================
// Chat popup déplaçable
// =====================
chatPopup.addEventListener("mousedown", (e) => {
  if (e.target.closest(".chat-header")) {
    dragging = true;
    offset.x = e.clientX - chatPopup.offsetLeft;
    offset.y = e.clientY - chatPopup.offsetTop;
  }
});

document.addEventListener("mousemove", (e) => {
  if (dragging) {
    chatPopup.style.left = `${e.clientX - offset.x}px`;
    chatPopup.style.top = `${e.clientY - offset.y}px`;
  }
});

document.addEventListener("mouseup", () => {
  dragging = false;
});

closeChatBtn.addEventListener("click", () => {
  chatPopup.classList.add("hidden");
});

// =====================
// Envoi message chat
// =====================
sendChatBtn.addEventListener("click", async () => {
  const message = chatInput.value.trim();
  if (!message) return;
  chatInput.value = "";
  await sendChatMessage(message);
});

async function sendChatMessage(text) {
  try {
    const url = `${API_BASE}=chat/send&api_key=${apiKey}`;
    await axios.post(url, { message: text });
    await loadChatMessages();
  } catch (e) {
    console.warn("Erreur envoi message:", e.message);
  }
}

// =====================
// Chargement des messages
// =====================
async function loadChatMessages() {
  try {
    const url = `${API_BASE}=chat/list&api_key=${apiKey}`;
    const res = await axios.get(url);
    chatMessages.innerHTML = "";
    (res.data.messages || []).forEach(m => {
      const p = document.createElement("p");
      if (m.is_admin) p.classList.add("admin");
      p.textContent = `${m.user}: ${m.text}`;
      chatMessages.appendChild(p);
    });
    chatMessages.scrollTop = chatMessages.scrollHeight;
  } catch (e) {
    console.warn("Erreur récupération chat:", e.message);
  }
}

function startChatPolling() {
  loadChatMessages();
  setInterval(loadChatMessages, 5000);
}

// =====================
// Tracking via Bridge Python
// =====================
async function startBridgeConnection() {
  try {
    const bridgeSocket = new WebSocket("ws://127.0.0.1:32123");
    bridgeSocket.onopen = () => console.log("🟢 Connecté au bridge SimConnect/XPlane");
    bridgeSocket.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      updateFlightData(data);
    };
    bridgeSocket.onerror = () => console.warn("⚠️ Impossible de se connecter au bridge local (sim non détecté)");
  } catch (e) {
    console.error("Erreur bridge:", e.message);
  }
}

function updateFlightData(d) {
  const text = `Latitude: ${d.latitude.toFixed(4)}
Longitude: ${d.longitude.toFixed(4)}
Altitude: ${d.altitude.toFixed(0)} ft
Vitesse: ${d.airspeed.toFixed(0)} kts
Phase: ${d.phase}`;
  flightData.textContent = text;

  if (d.phase === "LANDED" && d.airspeed < 10) {
    pirepStatus.textContent = "🟢 Vol terminé - prêt pour PIREP.";
    sendPirepBtn.classList.remove("hidden");
  }
}

// =====================
// Envoi PIREP
// =====================
sendPirepBtn.addEventListener("click", async () => {
  try {
    const url = `${API_BASE}=pireps/send&api_key=${apiKey}`;
    await axios.post(url, { flight: currentFlight || {}, user: currentUser });
    pirepStatus.textContent = "✅ PIREP envoyé avec succès !";
    sendPirepBtn.classList.add("hidden");
  } catch (e) {
    pirepStatus.textContent = "❌ Erreur lors de l'envoi du PIREP.";
  }
});

// =====================
// Auto login si clé stockée
// =====================
window.addEventListener("DOMContentLoaded", async () => {
  if (apiKey) await verifyApiKey(apiKey);
});
