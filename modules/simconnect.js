const axios = require('axios');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const cfg = require('../config.json');

let usingSimConnect = false;

// try to require a SimConnect module (only if installed)
function tryNativeSimConnect(callback) {
  try {
    const SimConnect = require('msfs-simconnect');
    usingSimConnect = true;
    const sim = new SimConnect();
    sim.connect('ACARS Electron', () => {
      console.log('✅ Connecté via msfs-simconnect (native)');
      sim.requestDataOnSimObjectType(
        'ACARS_DATA',
        ['PLANE LATITUDE','PLANE LONGITUDE','PLANE ALTITUDE','AIRSPEED INDICATED'],
        SimConnect.SIMCONNECT_SIMOBJECT_TYPE_USER
      );
      sim.on('simobjectData', data => {
        callback({
          lat: data['PLANE LATITUDE'],
          lon: data['PLANE LONGITUDE'],
          alt: data['PLANE ALTITUDE'],
          speed: data['AIRSPEED INDICATED']
        });
      });
    });
    sim.on('error', e => console.warn('SimConnect error', e));
    sim.on('disconnected', () => { console.warn('SimConnect disconnected'); usingSimConnect=false; });
    return true;
  } catch (e) {
    return false;
  }
}

function startBridgeExe() {
  const exePath = path.join(__dirname, '../bridge/acars_simconnect_bridge.exe');
  const pyPath = path.join(__dirname, '../bridge/acars_simconnect_bridge.py');
  if (fs.existsSync(exePath)) {
    const bridge = spawn(exePath, { detached:true, stdio:'ignore' });
    bridge.unref();
    return true;
  }
  // fallback: spawn python script (visible only if no exe)
  if (fs.existsSync(pyPath)) {
    const py = spawn('py', [pyPath], { detached:true, stdio:'ignore' });
    py.unref();
    return true;
  }
  return false;
}

module.exports = {
  connect(callback) {
    // first try native simconnect module
    if (tryNativeSimConnect(callback)) return;

    // else start the bridge exe (or py fallback)
    const ok = startBridgeExe();
    if (!ok) {
      console.warn('No bridge found — starting demo mode.');
      // demo
      setInterval(() => {
        callback({ lat:43.4368 + Math.random()*0.02, lon:5.2150 + Math.random()*0.02, alt:3000 + Math.random()*100, speed:230 + Math.random()*10 });
      }, 5000);
      return;
    }

    // poll local bridge
    setInterval(async () => {
      try {
        const res = await axios.get(cfg.bridgeLocalUrl);
        callback(res.data);
      } catch (e) {
        // silently ignore until bridge ready
      }
    }, 5000);
  }
};
