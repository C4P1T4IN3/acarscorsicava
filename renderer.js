// ==============================
// ACARS Air Corsica Virtuel — Renderer complet (version stable)
// ==============================

const API_BASE = "https://crew.aircorsica-virtuel.fr/api_proxy.php?endpoint";
const chatRefreshDelay = 5000;

// ===== Sélecteurs rapides =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// ===== Éléments DOM =====
const sections = $$(".section");
const menuItems = $$(".menu-item");
const pilotName = $("#pilotName");
const apiKeyDisplay = $("#apiKeyDisplay");
const logoutBtn = $("#logoutBtn");
const flightLog = $("#flightLog");

// ===== HUD =====
const hud = {
  heading: $("#hud-heading"),
  speed: $("#hud-speed"),
  alt: $("#hud-alt"),
  phase: $("#hud-phase"),
};

// ===== Chat =====
const chatMessages = $("#chatMessages");
const chatInput = $("#chatMessageInput");
const sendChatBtn = $("#sendChatBtn");

// ===== Stats Overlay =====
const elStatDuration = $("#stat-duration");
const elStatDistance = $("#stat-distance");
const elStatMaxSpeed = $("#stat-maxspeed");
const elStatMaxAlt = $("#stat-maxalt");
const elStatFuel = $("#stat-fuel");
const elStatPhase = $("#stat-phase");

// ===== État global =====
let apiKey = localStorage.getItem("apiKey") || null;
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

// =============================
// 🧭 NAVIGATION ENTRE SECTIONS
// =============================
function showSection(id) {
  sections.forEach((s) => s.classList.remove("active"));
  const el = document.getElementById(id);
  if (el) el.classList.add("active");
}

menuItems.forEach((btn) => {
  btn.addEventListener("click", () => {
    menuItems.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    showSection(btn.getAttribute("data-section"));
  });
});

if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("apiKey");
    Swal.fire("Déconnecté", "Vous avez été déconnecté.", "info").then(() => location.reload());
  });
}

// =============================
// 🗺️ INITIALISATION CARTE
// =============================
function initMap() {
  if (typeof L === "undefined") return console.error("Leaflet non chargé");

  map = L.map("map", { center: [42.5, 9.0], zoom: 6, zoomControl: true });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
    maxZoom: 18,
  }).addTo(map);

  const myPlaneIcon = L.icon({
    iconUrl: "https://cdn-icons-png.flaticon.com/512/162/162740.png",
    iconSize: [42, 42],
    iconAnchor: [21, 21],
  });

  aircraftMarker = L.marker([42.5, 9.0], { icon: myPlaneIcon }).addTo(map);

  flightPath = L.polyline([], { color: "#1E90FF", weight: 3, opacity: 0.8 }).addTo(map);
}

// =============================
// 📜 LOGS EN DIRECT
// =============================
function addLog(msg) {
  if (!flightLog) return;
  const t = new Date().toLocaleTimeString("fr-FR", { hour12: false });
  const p = document.createElement("div");
  p.textContent = `[${t}] ${msg}`;
  flightLog.appendChild(p);
  flightLog.scrollTop = flightLog.scrollHeight;
}

// =============================
// 🎯 HUD (cap, vitesse, altitude)
// =============================
function updateHUD(heading, speed, alt, phase) {
  if (hud.heading) hud.heading.textContent = `${(heading || 0).toFixed(0)}°`;
  if (hud.speed) hud.speed.textContent = `${(speed || 0).toFixed(0)} kts`;
  if (hud.alt) hud.alt.textContent = `${(alt || 0).toFixed(0)} ft`;
  if (hud.phase) hud.phase.textContent = phase || "—";
}

// =============================
// 📏 DISTANCE ENTRE DEUX POINTS
// =============================
function haversineNM(p1, p2) {
  const R = 3440.065;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(p2.lat - p1.lat);
  const dLon = toRad(p2.lon - p1.lon);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// =============================
// 🛰️ SIMCONNECT BRIDGE LOCAL
// =============================
function startBridge() {
  try {
    const ws = new WebSocket("ws://127.0.0.1:32123");
    ws.onopen = () => addLog("✅ Bridge SimConnect connecté");
    ws.onerror = () => addLog("⚠️ Bridge indisponible (Sim non lancé)");
    ws.onmessage = (e) => {
      const d = JSON.parse(e.data || "{}");
      onSimData(d);
    };
  } catch (e) {
    addLog(`❌ Erreur bridge: ${e.message}`);
  }
}

// =============================
// ✈️ DONNÉES DE VOL SIMULATEUR
// =============================
function onSimData(d) {
  const lat = d.latitude ?? 0;
  const lon = d.longitude ?? 0;
  const speed = d.airspeed ?? 0;
  const alt = d.altitude ?? 0;
  const heading = d.heading ?? 0;
  const phase = d.phase ?? "—";
  const fuel = d.fuel ?? null;

  if (map && lat && lon) {
    const pos = [lat, lon];
    aircraftMarker.setLatLng(pos);
    if (aircraftMarker.setRotationAngle) aircraftMarker.setRotationAngle(heading);
    pathCoords.push(pos);
    flightPath.setLatLngs(pathCoords);
    if (pathCoords.length === 1) map.setView(pos, 8);
  }

  if (lastPosition && lat && lon) totalDistance += haversineNM(lastPosition, { lat, lon });
  lastPosition = { lat, lon };
  if (speed > maxSpeed) maxSpeed = speed;
  if (alt > maxAltitude) maxAltitude = alt;
  if (!startTime && phase !== "PARKED") startTime = Date.now();

  updateHUD(heading, speed, alt, phase);
  if (elStatDuration) elStatDuration.textContent = fmtTime(startTime ? (Date.now() - startTime) / 1000 : 0);
  if (elStatDistance) elStatDistance.textContent = `${totalDistance.toFixed(1)} nm`;
  if (elStatMaxSpeed) elStatMaxSpeed.textContent = `${maxSpeed.toFixed(0)} kts`;
  if (elStatMaxAlt) elStatMaxAlt.textContent = `${maxAltitude.toFixed(0)} ft`;
  if (elStatFuel) elStatFuel.textContent = fuel ? `${fuel} kg` : "--";
  if (elStatPhase) elStatPhase.textContent = phase;

  if (d._phase_logged !== phase && phase) {
    addLog(`🟢 Nouvelle phase : ${phase}`);
    d._phase_logged = phase;
  }
}

// =============================
// 🌍 AUTRES AVIONS (ACARS)
// =============================
async function updateOtherAircraft() {
  if (!map) return;
  try {
    const res = await axios.get("https://crew.aircorsica-virtuel.fr/api/acars");
    const flights = res.data?.data || [];

    Object.values(otherAircraftMarkers).forEach((m) => map.removeLayer(m));
    otherAircraftMarkers = {};

    const otherPlaneIcon = L.icon({
      iconUrl: "https://cdn-icons-png.flaticon.com/512/1039/1039716.png",
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });

    flights.forEach((f) => {
      const lat = f?.position?.lat ?? f?.latitude;
      const lon = f?.position?.lon ?? f?.longitude;
      if (!lat || !lon) return;

      const hdg = f?.position?.heading || 0;
      const pilot = f?.user?.name_private || "Pilote";
      const callsign = f?.flight?.flight_number || "N/A";
      const dep = f?.flight?.dpt_airport_id || "--";
      const arr = f?.flight?.arr_airport_id || "--";
      const alt = f?.position?.altitude ? `${f.position.altitude} ft` : "—";
      const spd = f?.position?.groundspeed ? `${f.position.groundspeed} kts` : "—";
      const aircraft = f?.aircraft?.name || "—";

      const marker = L.marker([lat, lon], { icon: otherPlaneIcon }).addTo(map);
      if (marker.setRotationAngle) marker.setRotationAngle(hdg);

      marker.bindTooltip(
        `<b>${pilot}</b><br>✈️ ${callsign} (${aircraft})<br>📍 ${dep} → ${arr}<br>⬆️ ${alt} | 💨 ${spd} | 🧭 ${hdg}°`,
        { direction: "top" }
      );
      otherAircraftMarkers[pilot] = marker;
    });
  } catch {
    addLog("⚠️ Erreur chargement ACARS autres avions");
  }
}

// =============================
// 💬 CHAT PILOTE
// =============================
function startChatPolling() {
  loadChatMessages();
  setInterval(loadChatMessages, chatRefreshDelay);
}

async function loadChatMessages() {
  if (!apiKey || !chatMessages) return;
  try {
    const url = `${API_BASE}=chat/list&api_key=${apiKey}`;
    const res = await axios.get(url);
    chatMessages.innerHTML = "";
    (res.data?.messages || []).forEach((m) => {
      const div = document.createElement("div");
      div.className = m.is_admin ? "chat admin" : "chat user";
      div.innerHTML = `<strong>${m.user}:</strong> ${m.text}`;
      chatMessages.appendChild(div);
    });
    chatMessages.scrollTop = chatMessages.scrollHeight;
  } catch {}
}

if (sendChatBtn && chatInput) {
  sendChatBtn.addEventListener("click", async () => {
    const text = chatInput.value.trim();
    if (!text || !apiKey) return;
    try {
      await axios.post(`${API_BASE}=chat/send&api_key=${apiKey}`, { message: text });
      chatInput.value = "";
      loadChatMessages();
    } catch {}
  });
}

// =============================
// 🛫 VOLS ASSIGNÉS
// =============================
async function loadFlights() {
  if (!apiKey) return;
  const list = document.getElementById("flightsList");
  if (!list) return;
  try {
    const res = await axios.get(`${API_BASE}=flights&api_key=${apiKey}`);
    const flights = res.data?.flights || [];
    if (!flights.length) {
      list.innerHTML = "<p>Aucun vol assigné.</p>";
      return;
    }
    list.innerHTML = "";
    flights.forEach((f) => {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <h3>${f.flight_number || "VOL"}</h3>
        <p><strong>Départ :</strong> ${f.depicao}</p>
        <p><strong>Arrivée :</strong> ${f.arricao}</p>
        <p><strong>Avion :</strong> ${f.aircraft || "—"}</p>
        <button class="btn start-flight" data-id="${f.id}">Démarrer le vol</button>
      `;
      list.appendChild(card);
    });
    $$(".start-flight").forEach((b) =>
      b.addEventListener("click", (e) => {
        currentFlight = { id: e.target.getAttribute("data-id") };
        Swal.fire("Vol chargé", "Le suivi du vol est actif.", "info");
      })
    );
  } catch {
    list.innerHTML = "<p style='color:#ff6b6b'>Erreur lors du chargement.</p>";
  }
}

// =============================
// 🔐 AUTHENTIFICATION
// =============================
async function verifyApiKey(key) {
  try {
    const res = await axios.get(`${API_BASE}=user&api_key=${key}`);
    const user = res.data?.data || res.data?.user || res.data;
    if (!user?.id) throw new Error("Clé invalide");
    currentUser = user;
    apiKey = key;
    localStorage.setItem("apiKey", key);
    if (pilotName) pilotName.textContent = user.name || user.ident || "Pilote";
    if (apiKeyDisplay) apiKeyDisplay.textContent = key;
    Swal.fire({
      title: "Connexion réussie",
      text: `Bienvenue ${user.name || ""}`,
      icon: "success",
      timer: 1400,
      showConfirmButton: false,
    });
    loadFlights();
    startChatPolling();
  } catch {
    Swal.fire("Erreur", "Clé API invalide ou API injoignable.", "error");
  }
}

// =============================
// ⏱️ UTILITAIRE FORMAT TEMPS
// =============================
function fmtTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}:${m.toString().padStart(2, "0")}`;
}

// =============================
// ⚙️ GESTION MISE À JOUR (autoUpdater)
// =============================
if (window.electronAPI) {
  window.electronAPI.onBridgeData((data) => {
    if (data.type === "update-available") {
      Swal.fire({
        title: "Mise à jour disponible",
        text: `Version ${data.version} trouvée. Téléchargement...`,
        icon: "info",
        showConfirmButton: false,
      });
    }

    if (data.type === "update-progress") {
      Swal.update({ text: `Téléchargement ${data.percent}%...` });
    }

    if (data.type === "update-downloaded") {
      Swal.fire({
        title: "Mise à jour prête",
        text: "Redémarrer maintenant pour installer ?",
        icon: "success",
        showCancelButton: true,
        confirmButtonText: "Installer maintenant",
      }).then((r) => {
        if (r.isConfirmed) window.electronAPI.installUpdate();
      });
    }

    if (data.type === "update-error") {
      Swal.fire("Erreur", data.message || "Échec de la vérification de mise à jour.", "error");
    }
  });
}

// =============================
// 🚀 INITIALISATION
// =============================
window.addEventListener("DOMContentLoaded", () => {
  initMap();
  startBridge();
  setInterval(updateOtherAircraft, 15000);
  setTimeout(updateOtherAircraft, 2000);

  if (apiKey) {
    verifyApiKey(apiKey);
  } else {
    Swal.fire({
      title: "Connexion requise",
      input: "text",
      inputLabel: "Entrez votre clé API phpVMS",
      inputPlaceholder: "ex: 123456abcdef",
      confirmButtonText: "Connexion",
      allowOutsideClick: false,
      preConfirm: (k) => verifyApiKey(k),
    });
  }
});
