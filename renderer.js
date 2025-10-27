// ==============================================
// ACARS Air Corsica Virtuel - Renderer principal
// ==============================================

// =====================
// Configuration globale
// =====================
const API_BASE = "https://crew.aircorsica-virtuel.fr/api_proxy.php?endpoint";
const chatRefreshDelay = 5000;

let apiKey = localStorage.getItem("apiKey");
let currentUser = null;
let currentFlight = null;

let map, aircraftMarker, flightPath;
let pathCoords = [];
let otherAircraftMarkers = {};
let startTime = null;
let maxSpeed = 0;
let maxAltitude = 0;
let lastPosition = null;
let totalDistance = 0;

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

// =====================================================
// 🆕 GESTION DES MISES À JOUR AUTOMATIQUES
// =====================================================
if (window.electronAPI) {
  window.electronAPI.onBridgeData((data) => {
    if (data.type === "update-available") {
      Swal.fire({
        title: "Mise à jour disponible",
        text: `Version ${data.version} trouvée. Voulez-vous la télécharger maintenant ?`,
        icon: "info",
        showCancelButton: true,
        confirmButtonText: "Télécharger",
        cancelButtonText: "Plus tard",
      }).then((r) => {
        if (r.isConfirmed) window.electronAPI.downloadUpdate();
      });
    }

    if (data.type === "update-downloaded") {
      Swal.fire({
        title: "Mise à jour prête",
        text: "Redémarrer pour installer la mise à jour ?",
        icon: "success",
        showCancelButton: true,
        confirmButtonText: "Redémarrer maintenant",
      }).then((r) => {
        if (r.isConfirmed) window.electronAPI.installUpdate();
      });
    }

    if (data.type === "update-error") {
      Swal.fire("Erreur", data.message || "Échec de la vérification de mise à jour.", "error");
    }
  });
}

// =====================================================
// 🆕 VERSION COURANTE (affichée dans la sidebar)
// =====================================================
try {
  const { ipcRenderer } = require("electron");
  ipcRenderer.invoke("app-version").then((v) => {
    const versionEl = document.querySelector(".version");
    if (versionEl) versionEl.textContent = `v${v}`;
  });
} catch {}

// =====================
// Initialisation de la carte
// =====================
function initMap() {
  if (typeof L === "undefined") return console.error("❌ Leaflet non chargé !");

  map = L.map("map", { center: [42.5, 9.0], zoom: 6, zoomControl: true });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "© OpenStreetMap contributors",
  }).addTo(map);

  aircraftMarker = L.marker([42.5, 9.0], {
    icon: L.icon({
      iconUrl: "https://cdn-icons-png.flaticon.com/512/182/182548.png",
      iconSize: [42, 42],
      iconAnchor: [21, 21],
    }),
  }).addTo(map);

  flightPath = L.polyline([], { color: "#1E90FF", weight: 3, opacity: 0.8 }).addTo(map);
}

// =====================
// Journal de vol
// =====================
function addFlightLog(msg) {
  const t = new Date().toLocaleTimeString("fr-FR", { hour12: false });
  const e = document.createElement("p");
  e.textContent = `[${t}] ${msg}`;
  flightLog.appendChild(e);
  flightLog.scrollTop = flightLog.scrollHeight;
}

// =====================
// Données de vol (depuis bridge local)
// =====================
function updateFlightData(d) {
  const lat = d.latitude ?? 0;
  const lon = d.longitude ?? 0;
  const spd = d.airspeed ?? 0;
  const alt = d.altitude ?? 0;
  const phase = d.phase ?? "—";
  const fuel = d.fuel ?? null;

  if (lastPosition && lat && lon)
    totalDistance += haversineDistance(lastPosition, { lat, lon });
  lastPosition = { lat, lon };

  if (spd > maxSpeed) maxSpeed = spd;
  if (alt > maxAltitude) maxAltitude = alt;
  if (!startTime && phase !== "PARKED") startTime = Date.now();
  const duration = startTime ? (Date.now() - startTime) / 1000 : 0;

  if (map && lat && lon) {
    const pos = [lat, lon];
    aircraftMarker.setLatLng(pos);
    pathCoords.push(pos);
    flightPath.setLatLngs(pathCoords);
  }

  flightData.textContent = `
Latitude: ${lat.toFixed(4)}
Longitude: ${lon.toFixed(4)}
Altitude: ${alt.toFixed(0)} ft
Vitesse: ${spd.toFixed(0)} kts
Phase: ${phase}
  `;

  document.getElementById("stat-duration").textContent = formatTime(duration);
  document.getElementById("stat-distance").textContent = totalDistance.toFixed(1) + " nm";
  document.getElementById("stat-maxspeed").textContent = maxSpeed.toFixed(0) + " kts";
  document.getElementById("stat-maxalt").textContent = maxAltitude.toFixed(0) + " ft";
  document.getElementById("stat-fuel").textContent = fuel ? fuel + " kg" : "--";
  document.getElementById("stat-phase").textContent = phase;

  if (phase === "LANDED" && spd < 10) {
    pirepStatus.textContent = "🟢 Vol terminé - prêt pour PIREP";
    sendPirepBtn.classList.remove("hidden");
    addFlightLog("🟢 Atterrissage détecté — vol terminé");
  }
}

// =============================
// ✈️  Autres pilotes (en ligne sur phpVMS)
// =============================
async function updateOtherAircraft() {
  if (!map) return;
  try {
    const r = await axios.get("https://crew.aircorsica-virtuel.fr/api/acars");
    const flights = r.data.data || [];

    Object.values(otherAircraftMarkers).forEach((m) => map.removeLayer(m));
    otherAircraftMarkers = {};

    flights.forEach((f) => {
      if (!f.position || !f.user || !f.flight) return;

      const lat = f.position.lat || f.latitude;
      const lon = f.position.lon || f.longitude;
      if (!lat || !lon) return;

      const pilot = f.user.name_private || "Inconnu";
      const callsign = f.flight.flight_number || "N/A";
      const dep = f.flight.dpt_airport_id || "--";
      const arr = f.flight.arr_airport_id || "--";
      const alt = f.position.altitude ? `${f.position.altitude} ft` : "—";
      const spd = f.position.groundspeed ? `${f.position.groundspeed} kts` : "—";
      const hdg = f.position.heading || 0;
      const aircraft = f.aircraft ? f.aircraft.name : "Inconnu";

      const marker = L.marker([lat, lon], {
        icon: L.icon({
          iconUrl: "https://cdn-icons-png.flaticon.com/512/2933/2933861.png",
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        }),
        rotationAngle: hdg,
        rotationOrigin: "center center",
      }).addTo(map);

      marker.bindTooltip(
        `<b>${pilot}</b><br>
        ✈️ ${callsign} (${aircraft})<br>
        📍 ${dep} → ${arr}<br>
        ⬆️ ${alt} | 💨 ${spd}<br>
        🧭 Cap : ${hdg}°`,
        { direction: "top" }
      );

      otherAircraftMarkers[pilot] = marker;
    });
  } catch (e) {
    console.error("❌ Erreur récupération avions:", e.message);
  }
}
setInterval(updateOtherAircraft, 15000);

// =====================
// Gestion Chat
// =====================
async function loadChatMessages() {
  try {
    const r = await axios.get(`${API_BASE}=chat/list&api_key=${apiKey}`);
    chatMessages.innerHTML = "";
    (r.data.messages || []).forEach((m) => {
      const div = document.createElement("div");
      div.className = m.is_admin ? "chat admin" : "chat user";
      div.innerHTML = `<strong>${m.user}:</strong> ${m.text}`;
      chatMessages.appendChild(div);
    });
    chatMessages.scrollTop = chatMessages.scrollHeight;
  } catch (e) {
    console.warn("Erreur chat:", e.message);
  }
}
async function sendChatMessage() {
  const msg = chatInput.value.trim();
  if (!msg) return;
  chatInput.value = "";
  try {
    await axios.post(`${API_BASE}=chat/send&api_key=${apiKey}`, { message: msg });
    loadChatMessages();
  } catch (e) {
    console.warn("Erreur envoi chat:", e.message);
  }
}
sendChatBtn.addEventListener("click", sendChatMessage);

// =====================
// Authentification API
// =====================
async function verifyApiKey(key) {
  try {
    const res = await axios.get(`${API_BASE}=user&api_key=${key}`);
    const user = res.data?.data || res.data?.user;
    if (!user) throw new Error("Clé invalide");

    currentUser = user;
    apiKey = key;
    localStorage.setItem("apiKey", key);
    pilotName.textContent = user.name || user.ident || "Pilote";
    apiKeyDisplay.textContent = key;
    Swal.fire("Connexion réussie", `Bienvenue ${user.name}!`, "success");

    loadFlights();
    startChatPolling();
    startBridgeConnection();
  } catch (err) {
    Swal.fire("Erreur", "Clé API invalide ou serveur injoignable.", "error");
  }
}

// =====================
// Vols assignés
// =====================
async function loadFlights() {
  try {
    const res = await axios.get(`${API_BASE}=flights&api_key=${apiKey}`);
    const flights = res.data?.flights || [];
    if (!flights.length) {
      flightsList.innerHTML = "<p>Aucun vol assigné</p>";
      return;
    }
    flightsList.innerHTML = "";
    flights.forEach((f) => {
      const card = document.createElement("div");
      card.classList.add("card");
      card.innerHTML = `
        <h3>${f.flight_number}</h3>
        <p><b>Départ:</b> ${f.depicao}</p>
        <p><b>Arrivée:</b> ${f.arricao}</p>
        <p><b>Avion:</b> ${f.aircraft || "—"}</p>
        <button class="btn start-flight" data-id="${f.id}">Démarrer</button>`;
      flightsList.appendChild(card);
    });
    document.querySelectorAll(".start-flight").forEach((b) =>
      b.addEventListener("click", (e) => startFlight(e.target.dataset.id))
    );
  } catch (e) {
    flightsList.innerHTML = "<p style='color:red'>Erreur chargement vols</p>";
  }
}
function startFlight(id) {
  currentFlight = { id };
  Swal.fire("Vol chargé", "Suivi activé.", "info");
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
  } catch {
    pirepStatus.textContent = "❌ Erreur PIREP.";
    Swal.fire("Erreur", "Impossible d'envoyer le PIREP.", "error");
  }
});

// =====================
// Bridge local (SimConnect via WebSocket)
// =====================
function startBridgeConnection() {
  try {
    const ws = new WebSocket("ws://127.0.0.1:32123");
    ws.onopen = () => console.log("🟢 Bridge connecté");
    ws.onmessage = (ev) => updateFlightData(JSON.parse(ev.data));
    ws.onerror = () => console.warn("⚠️ Bridge non dispo");
  } catch (e) {
    console.warn("Erreur bridge:", e.message);
  }
}

// =====================
// Navigation / déconnexion
// =====================
menuItems.forEach((b) =>
  b.addEventListener("click", () => {
    menuItems.forEach((m) => m.classList.remove("active"));
    b.classList.add("active");
    sections.forEach((s) => s.classList.remove("active"));
    document.getElementById(b.dataset.section).classList.add("active");
  })
);
logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("apiKey");
  Swal.fire("Déconnecté", "Vous avez été déconnecté.", "info").then(() =>
    location.reload()
  );
});

// =====================
// Chat polling + helpers
// =====================
function startChatPolling() {
  loadChatMessages();
  setInterval(loadChatMessages, chatRefreshDelay);
}

// =====================
// Utilitaires
// =====================
function haversineDistance(p1, p2) {
  const R = 3440.065;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(p2.lat - p1.lat);
  const dLon = toRad(p2.lon - p1.lon);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function formatTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}:${m.toString().padStart(2, "0")}`;
}

// =====================
// Initialisation
// =====================
window.addEventListener("DOMContentLoaded", async () => {
  initMap();
  setTimeout(updateOtherAircraft, 2000);
  if (apiKey) await verifyApiKey(apiKey);
  else {
    Swal.fire({
      title: "Connexion requise",
      input: "text",
      inputLabel: "Entrez votre clé API phpVMS",
      confirmButtonText: "Connexion",
      allowOutsideClick: false,
      preConfirm: verifyApiKey,
    });
  }
});
