/** SafeAlert app module — GPS watch + coords display */
/* eslint-disable */
// ── GPS ───────────────────────────────────────────────────────────────────────
function onGpsPosition(p) {
  uLat = p.coords.latitude;
  uLng = p.coords.longitude;
  window.uLat = uLat;
  window.uLng = uLng;
  const acc = Math.round(p.coords.accuracy || 50);
  document.getElementById('gps-led').classList.add('on');
  document.getElementById('gps-txt').textContent = `GPS ±${acc}m`;
  if (map) {
    if (!userMk) {
      const ic = L.divIcon({
        html: `<div style="width:14px;height:14px;border-radius:50%;background:#3B82F6;border:2.5px solid white;box-shadow:0 0 12px #3B82F688"></div>`,
        className: '',
        iconAnchor: [7, 7],
      });
      userMk = L.marker([uLat, uLng], { icon: ic, zIndexOffset: 1000 }).addTo(map);
      userMk.bindTooltip('You', { permanent: false, direction: 'top' });
    } else userMk.setLatLng([uLat, uLng]);
  }
  setGPSBox(uLat, uLng);
  if (!window._gpsZonesReloaded && isNigeriaCoords(uLat, uLng)) {
    window._gpsZonesReloaded = true;
    clearTimeout(gpsZonesReloadTimer);
    gpsZonesReloadTimer = setTimeout(() => {
      loadMapZones().catch(() => {});
      loadAllZonesData()
        .then(() => {
          if (currentScreen === 'insights') buildInsights();
        })
        .catch(() => {});
    }, 1200);
  }
  if (panicOn) {
    document.getElementById('pov-coords').textContent = `${uLat.toFixed(5)}°N, ${uLng.toFixed(5)}°E`;
  }
  if (typeof checkOfflineZoneWarning === 'function' && isNigeriaCoords(uLat, uLng)) {
    checkOfflineZoneWarning(uLat, uLng);
  }
}

function onGpsError() {
  document.getElementById('gps-txt').textContent = 'Weak GPS signal';
  uLat = 9.082;
  uLng = 8.675;
  setGPSBox(uLat, uLng, true);
}

function startGPS() {
  if (!navigator.geolocation) {
    document.getElementById('gps-txt').textContent = 'GPS unavailable';
    return;
  }
  gpsWatchId = navigator.geolocation.watchPosition(onGpsPosition, onGpsError, {
    enableHighAccuracy: true,
    maximumAge: 10000,
    timeout: 15000,
  });
}

function setGPSBox(lat, lng, demo = false) {
  const l = document.getElementById('gps-lbl');
  const c = document.getElementById('gps-crd');
  if (!l) return;
  l.textContent = demo ? 'Approximate location (enable GPS for accuracy)' : 'GPS detected ✓';
  c.textContent = `${lat.toFixed(5)}°N, ${lng.toFixed(5)}°E`;
  const sn3 = document.getElementById('sn3');
  if (sn3) {
    sn3.className = demo ? 'step-num curr' : 'step-num done';
    sn3.textContent = demo ? '3' : '✓';
  }
  const sub = document.getElementById('sub-btn');
  if (sub && selectedType) sub.disabled = false;
}
