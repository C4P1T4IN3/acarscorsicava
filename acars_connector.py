# ACARS Connector - Air Corsica Virtuel
# Mode générique sans FSUIPC (pour test et intégration)
from flask import Flask, jsonify
import threading, time, random

app = Flask(__name__)
flight_data = {"lat": 43.439, "lon": 5.215, "alt": 3000, "speed": 230}

def generate_fake_data():
    """Génère des données aléatoires de vol pour test local"""
    global flight_data
    print("⚠️  FSUIPC non disponible, mode démo actif.")
    while True:
        flight_data["lat"] = 43.439 + random.uniform(-0.01, 0.01)
        flight_data["lon"] = 5.215 + random.uniform(-0.01, 0.01)
        flight_data["alt"] = 3000 + random.uniform(-200, 200)
        flight_data["speed"] = 230 + random.uniform(-20, 20)
        time.sleep(5)

@app.route('/data')
def get_data():
    return jsonify(flight_data)

if __name__ == '__main__':
    threading.Thread(target=generate_fake_data, daemon=True).start()
    app.run(host='127.0.0.1', port=32123)
