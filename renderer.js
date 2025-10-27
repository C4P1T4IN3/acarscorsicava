// ==============================================
// ACARS Air Corsica Virtuel - Renderer principal
// ==============================================

const API_BASE = "https://crew.aircorsica-virtuel.fr/api_proxy.php?endpoint";
const chatRefreshDelay = 5000;

let apiKey = localStorage.getItem("apiKey");
let currentUser = null;
let currentFlight = null;

let map, aircraftMarker, flightPath;
let pathCoords = [];
let otherAircraftMarkers = {};

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

  // Ton avion (icône bleue)
  aircraftMarker = L.marker([42.5, 9.0], {
    icon: L.icon({
      iconUrl: "https://cdn-icons-png.flaticon.com/512/182/182548.png",
      iconSize: [42, 42],
      iconAnchor: [21, 21],
    }),
    rotationAngle: 0,
    rotationOrigin: "center center",
  }).addTo(map);

  // Ligne de trajectoire
  flightPath = L.polyline([], {
    color: "#1E90FF",
    weight: 3,
    opacity: 0.8,
  }).addTo(map);

  // Légende dynamique
  const legend = L.control({ position: "bottomright" });
  legend.onAdd = function () {
    const div = L.DomUtil.create("div", "map-legend");
    div.innerHTML = `
      <div style="background: rgba(20,25,40,0.8); padding:6px 10px; border-radius:8px; font-size:13px; color:#fff;">
        <b>Légende</b><br>
        🟦 Moi (mon appareil)<br>
        ⚪ Autres pilotes
      </div>
    `;
    return div;
  };
  legend.addTo(map);
}

// =====================
// Ajout log
// =====================
function addFlightLog(message) {
  const timestamp = new Date().toLocaleTimeString("fr-FR", { hour12: false });
  const entry = document.createElement("p");
  entry.textContent = `[${timestamp}] ${message}`;
  flightLog.appendChild(entry);
  flightLog.scrollTop = flightLog.scrollHeight;
}

// =====================
// Mise à jour de ton avion / vol
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
  const fuel = d.fuel ?? null;

  if (lastPosition && lat && lon) {
    const dist = haversineDistance(lastPosition, { lat, lon });
    totalDistance += dist;
  }
  lastPosition = { lat, lon };

  if (speed > maxSpeed) maxSpeed = speed;
  if (alt > maxAltitude) maxAltitude = alt;
  if (!startTime && phase !== "PARKED") startTime = Date.now();
  const duration = startTime ? (Date.now() - startTime) / 1000 : 0;

  if (map && lat && lon) {
    const pos = [lat, lon];
    aircraftMarker.setLatLng(pos);
    aircraftMarker.setRotationAngle(d.heading || 0);
    pathCoords.push(pos);
    flightPath.setLatLngs(pathCoords);
  }

  // Panneau principal
  flightData.textContent = `
Latitude: ${lat.toFixed(4)}
Longitude: ${lon.toFixed(4)}
Altitude: ${alt.toFixed(0)} ft
Vitesse: ${speed.toFixed(0)} kts
Phase: ${phase}
  `;

  // Statistiques
  document.getElementById("stat-duration").textContent = formatTime(duration);
  document.getElementById("stat-distance").textContent = totalDistance.toFixed(1) + " nm";
  document.getElementById("stat-maxspeed").textContent = maxSpeed.toFixed(0) + " kts";
  document.getElementById("stat-maxalt").textContent = maxAltitude.toFixed(0) + " ft";
  document.getElementById("stat-fuel").textContent = fuel ? fuel + " kg" : "--";
  document.getElementById("stat-phase").textContent = phase;

  if (phase === "LANDED" && speed < 10) {
    pirepStatus.textContent = "🟢 Vol terminé - prêt pour PIREP";
    sendPirepBtn.classList.remove("hidden");
    addFlightLog("🟢 Atterrissage détecté — vol terminé");
  }
}

// =============================
// ✈️  Autres avions (membres en vol)
// =============================
async function updateOtherAircraft() {
  if (!map) return;
  try {
    const response = await axios.get("https://crew.aircorsica-virtuel.fr/api/acars");
    const flights = response.data.data || [];

    Object.values(otherAircraftMarkers).forEach((marker) => map.removeLayer(marker));
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
  } catch (err) {
    console.error("❌ Erreur récupération avions:", err.message);
  }
}
setInterval(updateOtherAircraft, 15000);

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
// Chat / API / Auth / PIREP / etc.
// =====================
// → (ton code existant inchangé ici, tout le reste de ton renderer continue normalement)

// =====================
// Initialisation
// =====================
window.addEventListener("DOMContentLoaded", () => {
  initMap();
  setTimeout(updateOtherAircraft, 2000);
});
