const net = require('net');

module.exports = {
  connect(callback) {
    const client = new net.Socket();
    client.connect(49000, '127.0.0.1', () => {
      console.log('✅ Connecté à XPUIPC (X-Plane)');
    });

    setInterval(() => {
      // Exemple : tu adapteras les offsets XPUIPC selon ton besoin
      const data = { lat: 43.439, lon: 5.222, alt: 1000, speed: 120 }; // Placeholder
      callback(data);
    }, 10000);
  }
};
