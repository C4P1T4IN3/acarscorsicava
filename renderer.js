// ==============================================
// ACARS Air Corsica Virtuel - Renderer principal
// ==============================================

// =====================
// Imports globaux
// =====================
const API_BASE = "https://crew.aircorsica-virtuel.fr/api_proxy.php?endpoint";
const chatRefreshDelay = 5000;

let apiKey = localStorage.getItem("apiKey");
let currentUser = null;
let currentFlight = null;
let map, aircraftMarker, flightPath;
let pathCoords = [];

// =====================
// Sélecteurs DOM
// =====================
const sections = document.querySelectorAll(".section");
const menuItems = document.querySelectorAll(".menu-item");
const pilotName = document.getElementById("pilotName");
const apiKeyDisplay = document.getElementById("apiKeyDisplay");
const flightData = document.getElementById("flightData");
const sendPirepBtn = document.getElementById("sendPirepBtn");
const pirepStatus = document.getElementById("pirepStatus");
const flightsList = document.getElementById("flightsList");
const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatMessageInput");
const sendChatBtn = document.getElementById("sendChatBtn");
const logoutBtn = document.getElementById("logoutBtn");
const flightLog = document.getElementById("flightLog");

// =====================
// Initialisation carte Leaflet
// =====================
function initMap() {
  if (typeof L === "undefined") {
    console.error("❌ Leaflet non chargé !");
    return;
  }

  map = L.map("map", {
    center: [42.5, 9.0],
    zoom: 6,
    zoomControl: true,
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "© OpenStreetMap contributors",
  }).addTo(map);

  aircraftMarker = L.marker([42.5, 9.0], {
    icon: L.icon({
      iconUrl: "https://cdn-icons-png.flaticon.com/512/182/182548.png",
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    }),
  }).addTo(map);

  flightPath = L.polyline([], {
    color: "#1E90FF",
    weight: 3,
    opacity: 0.8,
  }).addTo(map);
}

// =====================
// Ajout dans le log de vol
// =====================
function addFlightLog(message) {
  const timestamp = new Date().toLocaleTimeString("fr-FR", { hour12: false });
  const entry = document.createElement("p");
  entry.textContent = `[${timestamp}] ${message}`;
  flightLog.appendChild(entry);
  flightLog.scrollTop = flightLog.scrollHeight;
}

// =====================
// Mise à jour du vol (SimConnect bridge)
// =====================
function updateFlightData(d) {
  const text = `
Latitude: ${d.latitude?.toFixed(4) ?? "—"}
Longitude: ${d.longitude?.toFixed(4) ?? "—"}
Altitude: ${d.altitude?.toFixed(0) ?? "—"} ft
Vitesse: ${d.airspeed?.toFixed(0) ?? "—"} kts
Phase: ${d.phase ?? "—"}
  `;
  flightData.textContent = text;

  // ✅ Mise à jour de la carte
  if (map && d.latitude && d.longitude) {
    const pos = [d.latitude, d.longitude];
    aircraftMarker.setLatLng(pos);
    pathCoords.push(pos);
    flightPath.setLatLngs(pathCoords);

    if (pathCoords.length === 1) map.setView(pos, 8);
    if (pathCoords.length % 10 === 0) map.setView(pos); // recenter périodiquement
  }

  // ✅ Log automatique selon la phase
  if (d.phase && !d._logged) {
    addFlightLog(`Phase: ${d.phase}`);
    d._logged = true;
  }

  if (d.phase === "LANDED" && d.airspeed < 10) {
    pirepStatus.textContent = "🟢 Vol terminé - prêt pour PIREP";
    sendPirepBtn.classList.remove("hidden");
    addFlightLog("🟢 Atterrissage détecté — vol terminé");
  }
}

// =====================
// Gestion du chat
// =====================
async function sendChatMessage() {
  const message = chatInput.value.trim();
  if (!message) return;
  chatInput.value = "";

  try {
    const url = `${API_BASE}=chat/send&api_key=${apiKey}`;
    await axios.post(url, { message });
    await loadChatMessages();
  } catch (e) {
    console.warn("Erreur envoi message:", e.message);
  }
}

async function loadChatMessages() {
  try {
    const url = `${API_BASE}=chat/list&api_key=${apiKey}`;
    const res = await axios.get(url);
    chatMessages.innerHTML = "";

    (res.data.messages || []).forEach((m) => {
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

// =====================
// Navigation & boutons
// =====================
menuItems.forEach((btn) => {
  btn.addEventListener("click", () => {
    menuItems.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    const sectionId = btn.getAttribute("data-section");
    sections.forEach((s) => s.classList.remove("active"));
    document.getElementById(sectionId).classList.add("active");
  });
});

logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("apiKey");
  Swal.fire({
    title: "Déconnexion",
    text: "Vous avez été déconnecté.",
    icon: "info",
  }).then(() => location.reload());
});

sendChatBtn.addEventListener("click", sendChatMessage);

// =====================
// Initialisation
// =====================
window.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    if (document.getElementById("map")) initMap();
  }, 500);
});

// =====================
// Navigation entre sections
// =====================
menuItems.forEach((item) => {
  item.addEventListener("click", () => {
    const section = item.getAttribute("data-section");
    if (!section) return;

    menuItems.forEach((btn) => btn.classList.remove("active"));
    item.classList.add("active");

    sections.forEach((sec) => sec.classList.remove("active"));
    document.getElementById(section).classList.add("active");
  });
});

// =====================
// Connexion API (clé)
// =====================
async function verifyApiKey(key) {
  try {
    const res = await axios.get(`${API_BASE}=user&api_key=${key}`);
    const user = res.data?.data || res.data?.user || res.data;

    if (!user || !user.id) throw new Error("Clé invalide");

    currentUser = user;
    apiKey = key;
    localStorage.setItem("apiKey", key);
    pilotName.textContent = user.name || user.ident || "Pilote";
    apiKeyDisplay.textContent = key;
    Swal.fire({
      title: "Connexion réussie",
      text: `Bienvenue, ${user.name || "pilote"} !`,
      icon: "success",
      timer: 1500,
      showConfirmButton: false,
    });

    loadFlights();
    startChatPolling();
    startBridgeConnection();
  } catch (err) {
    console.error("Erreur API:", err);
    Swal.fire("Erreur", "Clé API invalide ou API injoignable.", "error");
  }
}

// =====================
// Chargement des vols
// =====================
async function loadFlights() {
  try {
    const res = await axios.get(`${API_BASE}=flights&api_key=${apiKey}`);
    const flights = res.data?.flights || [];

    if (!flights.length) {
      flightsList.innerHTML = "<p>Aucun vol assigné pour le moment.</p>";
      return;
    }

    flightsList.innerHTML = "";
    flights.forEach((f) => {
      const card = document.createElement("div");
      card.classList.add("card");
      card.innerHTML = `
        <h3>${f.flight_number || "VOL"}</h3>
        <p><strong>Départ :</strong> ${f.depicao}</p>
        <p><strong>Arrivée :</strong> ${f.arricao}</p>
        <p><strong>Avion :</strong> ${f.aircraft || "—"}</p>
        <button class="btn start-flight" data-id="${f.id}">Démarrer le vol</button>
      `;
      flightsList.appendChild(card);
    });

    document.querySelectorAll(".start-flight").forEach((btn) =>
      btn.addEventListener("click", (e) => startFlight(e.target.dataset.id))
    );
  } catch (err) {
    flightsList.innerHTML =
      "<p style='color:red'>Erreur lors du chargement des vols.</p>";
    console.error("Erreur loadFlights:", err);
  }
}

// =====================
// Démarrer un vol
// =====================
function startFlight(flightId) {
  currentFlight = { id: flightId };
  Swal.fire("Vol chargé", "Le suivi du vol est actif.", "info");
}

// =====================
// Chat pilote
// =====================
async function loadChatMessages() {
  try {
    const res = await axios.get(`${API_BASE}=chat/list&api_key=${apiKey}`);
    const messages = res.data?.messages || [];

    chatMessages.innerHTML = "";
    messages.forEach((m) => {
      const div = document.createElement("div");
      div.className = m.is_admin ? "chat admin" : "chat user";
      div.innerHTML = `<strong>${m.user}:</strong> ${m.text}`;
      chatMessages.appendChild(div);
    });
    chatMessages.scrollTop = chatMessages.scrollHeight;
  } catch (e) {
    console.warn("Erreur récupération chat:", e.message);
  }
}

async function sendChatMessage(text) {
  if (!text.trim()) return;
  try {
    await axios.post(`${API_BASE}=chat/send&api_key=${apiKey}`, { message: text });
    chatInput.value = "";
    loadChatMessages();
  } catch (e) {
    console.error("Erreur envoi message:", e.message);
  }
}

sendChatBtn.addEventListener("click", () => {
  const msg = chatInput.value.trim();
  if (msg) sendChatMessage(msg);
});

function startChatPolling() {
  loadChatMessages();
  setInterval(loadChatMessages, chatRefreshDelay);
}

// =====================
// Bridge simulateur (WS local)
// =====================
function startBridgeConnection() {
  try {
    const ws = new WebSocket("ws://127.0.0.1:32123");
    ws.onopen = () => console.log("🟢 Bridge connecté");
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      updateFlightData(data);
    };
    ws.onerror = () => console.warn("⚠️ Bridge non disponible (Sim non lancé)");
  } catch (e) {
    console.error("Erreur bridge:", e.message);
  }
}

// =====================
// Données de vol & statistiques
// =====================
let startTime = null;
let maxSpeed = 0;
let maxAltitude = 0;
let lastPosition = null;
let totalDistance = 0;

function updateFlightData(d) {
  const lat = d.latitude ?? 0;
  const lon = d.longitude ?? 0;
  const speed = d.airspeed ?? 0;
  const alt = d.altitude ?? 0;
  const phase = d.phase ?? "—";
  const fuel = d.fuel ?? null; // si ton bridge l’envoie

  // 🧭 Calcul de la distance parcourue
  if (lastPosition && lat && lon) {
    const dist = haversineDistance(lastPosition, { lat, lon });
    totalDistance += dist;
  }
  lastPosition = { lat, lon };

  // 📈 Max Speed / Altitude
  if (speed > maxSpeed) maxSpeed = speed;
  if (alt > maxAltitude) maxAltitude = alt;

  // 🕒 Durée du vol
  if (!startTime && phase !== "PARKED") startTime = Date.now();
  const duration = startTime ? (Date.now() - startTime) / 1000 : 0;

  // 🗺️ Mise à jour visuelle de la carte
  if (map && lat && lon) {
    const pos = [lat, lon];
    aircraftMarker.setLatLng(pos);
    pathCoords.push(pos);
    flightPath.setLatLngs(pathCoords);
    if (pathCoords.length === 1) map.setView(pos, 8);
  }

  // 💾 Mise à jour du panneau principal
  flightData.textContent = `
Latitude: ${lat.toFixed(4)}
Longitude: ${lon.toFixed(4)}
Altitude: ${alt.toFixed(0)} ft
Vitesse: ${speed.toFixed(0)} kts
Phase: ${phase}
  `;

  // 🧮 Mise à jour du panneau de statistiques
  document.getElementById("stat-duration").textContent = formatTime(duration);
  document.getElementById("stat-distance").textContent = totalDistance.toFixed(1) + " nm";
  document.getElementById("stat-maxspeed").textContent = maxSpeed.toFixed(0) + " kts";
  document.getElementById("stat-maxalt").textContent = maxAltitude.toFixed(0) + " ft";
  document.getElementById("stat-fuel").textContent = fuel ? fuel + " kg" : "--";
  document.getElementById("stat-phase").textContent = phase;

  // 🪶 Log de phase
  if (d.phase && !d._logged) {
    addFlightLog(`Phase: ${d.phase}`);
    d._logged = true;
  }

  if (phase === "LANDED" && speed < 10) {
    pirepStatus.textContent = "🟢 Vol terminé - prêt pour PIREP";
    sendPirepBtn.classList.remove("hidden");
    addFlightLog("🟢 Atterrissage détecté — vol terminé");
  }
}

// =====================
// Utilitaires
// =====================

// Calcul distance entre 2 points en NM
function haversineDistance(p1, p2) {
  const R = 3440.065; // rayon Terre en nautiques
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(p2.lat - p1.lat);
  const dLon = toRad(p2.lon - p1.lon);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Format HH:MM:SS
function formatTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}:${m.toString().padStart(2, "0")}`;
}



// =====================
// Envoi du PIREP
// =====================
sendPirepBtn.addEventListener("click", async () => {
  try {
    await axios.post(`${API_BASE}=pireps/send&api_key=${apiKey}`, {
      flight: currentFlight || {},
      user: currentUser || {},
    });
    pirepStatus.textContent = "✅ PIREP envoyé avec succès !";
    sendPirepBtn.classList.add("hidden");
    Swal.fire("Succès", "PIREP envoyé avec succès.", "success");
  } catch (e) {
    pirepStatus.textContent = "❌ Erreur lors de l'envoi du PIREP.";
    Swal.fire("Erreur", "Impossible d'envoyer le PIREP.", "error");
  }
});

// =====================
// Déconnexion
// =====================
logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("apiKey");
  Swal.fire("Déconnecté", "Vous avez été déconnecté.", "info").then(() =>
    location.reload()
  );
});

// =====================
// Auto-connexion au démarrage
// =====================
window.addEventListener("DOMContentLoaded", async () => {
  if (apiKey) {
    await verifyApiKey(apiKey);
  } else {
    Swal.fire({
      title: "Connexion requise",
      input: "text",
      inputLabel: "Entrez votre clé API phpVMS",
      inputPlaceholder: "ex: 123456abcdef",
      confirmButtonText: "Connexion",
      allowOutsideClick: false,
      preConfirm: (key) => verifyApiKey(key),
    });
  }
});
