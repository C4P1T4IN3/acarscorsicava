const axios = require("axios");
const { spawn } = require("child_process");
const path = require("path");

module.exports = {
  connect(callback) {
    console.log("🟢 Lancement automatique du bridge Python SimConnect...");

    // Lancer le script Python
    const bridgePath = path.join(__dirname, "../bridge/acars_simconnect_bridge.py");
    const python = spawn("py", [bridgePath], { detached: true, stdio: "ignore" });
    python.unref();

    // Lecture des données toutes les 5 secondes
    setInterval(async () => {
      try {
        const res = await axios.get("http://127.0.0.1:32123/data");
        callback(res.data);
      } catch (err) {
        console.warn("⚠️ Données SimConnect non disponibles :", err.message);
      }
    }, 5000);
  },
};
