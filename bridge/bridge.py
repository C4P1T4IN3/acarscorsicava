# ============================================
# ACARS Air Corsica Virtuel - Bridge SimConnect
# Compatible MSFS2020 / MSFS2024
# ============================================

import asyncio
import json
import time
import websockets
from SimConnect import *
from SimConnect.Enum import SIMCONNECT_DATATYPE

PORT = 32123
UPDATE_INTERVAL = 2  # secondes
sim = None

# ============================
# Connexion à SimConnect
# ============================
def connect_to_sim():
    global sim
    try:
        sim = SimConnect()
        aq = AircraftRequests(sim, _time=UPDATE_INTERVAL)
        print("🟢 Connecté à Microsoft Flight Simulator via SimConnect.")
        return aq
    except Exception as e:
        print(f"❌ Impossible de se connecter à SimConnect: {e}")
        return None

# ============================
# Lecture des données avion
# ============================
def get_flight_data(aq):
    try:
        data = {
            "latitude": aq.get("PLANE_LATITUDE"),
            "longitude": aq.get("PLANE_LONGITUDE"),
            "altitude": aq.get("PLANE_ALTITUDE"),
            "airspeed": aq.get("AIRSPEED_INDICATED"),
            "heading": aq.get("PLANE_HEADING_DEGREES_TRUE"),
            "vertical_speed": aq.get("VERTICAL_SPEED"),
            "on_ground": aq.get("SIM_ON_GROUND"),
            "fuel_total": aq.get("FUEL_TOTAL_QUANTITY"),
        }

        # Déterminer la phase de vol
        if data["on_ground"]:
            if data["airspeed"] < 10:
                data["phase"] = "LANDED"
            else:
                data["phase"] = "TAXI"
        elif data["altitude"] < 2000:
            data["phase"] = "TAKEOFF"
        elif data["vertical_speed"] > 500:
            data["phase"] = "CLIMB"
        elif data["vertical_speed"] < -500:
            data["phase"] = "DESCENT"
        else:
            data["phase"] = "CRUISE"

        return data

    except Exception as e:
        print(f"⚠️ Erreur lecture données SimConnect: {e}")
        return None

# ============================
# Serveur WebSocket
# ============================
async def send_flight_data(websocket, path):
    aq = connect_to_sim()
    if not aq:
        await websocket.send(json.dumps({"error": "Simulateur non détecté"}))
        return

    print(f"📡 Envoi des données au client ACARS sur ws://127.0.0.1:{PORT}")
    while True:
        data = get_flight_data(aq)
        if data:
            await websocket.send(json.dumps(data))
        await asyncio.sleep(UPDATE_INTERVAL)

# ============================
# Démarrage du serveur
# ============================
async def main():
    print(f"🚀 ACARS Bridge lancé sur ws://127.0.0.1:{PORT}")
    async with websockets.serve(send_flight_data, "127.0.0.1", PORT):
        await asyncio.Future()  # boucle infinie

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n🛑 Bridge arrêté manuellement.")
    except Exception as e:
        print(f"❌ Erreur critique: {e}")
