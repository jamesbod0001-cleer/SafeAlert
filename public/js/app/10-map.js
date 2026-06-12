/** SafeAlert app module — Leaflet map + zone markers */
/* eslint-disable */
async function ensureMapLoaded() {
  const placeholder = document.getElementById('map-lazy-placeholder');
  if (map) {
    placeholder?.classList.add('hidden');
    return;
  }
  if (typeof L === 'undefined') {
    toast('Map library loading…', 'err');
    return;
  }
  placeholder?.classList.add('hidden');
  initMap();
}

// ── MAP ───────────────────────────────────────────────────────────────────────
function initMap() {
  if (map) return;
  if (typeof L === 'undefined') return;
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconUrl: '/app/vendor/leaflet/marker-icon.png',
    iconRetinaUrl: '/app/vendor/leaflet/marker-icon-2x.png',
    shadowUrl: '/app/vendor/leaflet/marker-shadow.png',
  });
  const zoom = ds().isEnabled() ? 5 : 6;
  map = L.map('lmap', { center: [9.082, 8.675], zoom, zoomControl: true, attributionControl: true });
  const tileOpts = {
    attribution: '© OpenStreetMap',
    ...ds().mapOptions(),
  };
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', tileOpts).addTo(map);
  zones.forEach(addMk);
  buildMapList();
  mapReady = true;
  map.on('click', (e) => {
    if (!pinMode) return;
    uLat = e.latlng.lat;
    uLng = e.latlng.lng;
    togglePin();
    go('report');
    setGPSBox(uLat, uLng);
    toast('📍 Location pinned — complete your report');
  });
}

function addMk(z) {
  if (!Number.isFinite(z.lat) || !Number.isFinite(z.lng)) return;
  if (markers[z.id]) return;
  const c = SEV_C[z.sev] || SEV_C.medium;
  const r = SEV_R[z.sev] || 13;
  const ti = types.find((t) => t.id === z.type) || { icon: '⚠️' };
  const pulse = L.circleMarker([z.lat, z.lng], {
    radius: r * 2.5,
    fillColor: c,
    color: 'transparent',
    weight: 0,
    fillOpacity: 0.08,
    interactive: false,
  });
  const circle = L.circleMarker([z.lat, z.lng], {
    radius: r,
    fillColor: c,
    color: 'rgba(255,255,255,0.35)',
    weight: 1.5,
    fillOpacity: 0.88,
    zoneId: z.id,
    severity: z.sev,
  });
  const vTotal = (z.vd || 0) + (z.vc || 0) || 1;
  const vPct = Math.round(((z.vd || 0) / vTotal) * 100);
  circle.bindPopup(
    `<div style="min-width:220px">
      <div class="pu-head">
        <div class="pu-icon" style="background:${c}18;border:1px solid ${c}44">${ico(ti.icon)}</div>
        <div>
          <div class="pu-title">${z.label}</div>
          <div class="pu-meta">${escapeHtml(z.state)}${z.lga ? ` · ${escapeHtml(z.lga)}` : ''} · ${z.time} · ${z.reports} reports</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <span class="badge badge-${z.sev === 'critical' ? 'red' : z.sev === 'high' ? 'amber' : 'gray'}">${z.sev.toUpperCase()}</span>
        <span style="font-size:10px;color:var(--text2);align-self:center">${z.ver ? '✓ Verified by community' : '⏳ Awaiting verification'}</span>
      </div>
      <div style="font-size:10px;color:var(--text2);margin-bottom:4px;display:flex;justify-content:space-between">
        <span>⚠️ ${z.vd} confirm danger</span><span>✓ ${z.vc} say cleared</span>
      </div>
      <div class="pu-bar"><div class="pu-bar-fill" style="width:${vPct}%;background:${c}"></div></div>
      <div class="pu-btns">
        <button class="pu-btn pu-confirm" onclick="confirmZ('${z.id}')">⚠️ Still Dangerous</button>
        <button class="pu-btn pu-clear" onclick="clearZ('${z.id}')">✓ Area Cleared</button>
      </div>
      <button class="pu-share" onclick="shareAlertById('${z.id}')">📤 ${t('share_alert')}</button>
    </div>`,
    { maxWidth: 260 }
  );
  pulse.addTo(map);
  circle.addTo(map);
  markers[z.id] = { circle, pulse };
}

function buildMapList() {
  let fl = curFilt === 'all' ? zones : zones.filter((z) => z.sev === curFilt);
  if (zoneSearchQ) {
    fl = fl.filter(
      (z) =>
        z.label.toLowerCase().includes(zoneSearchQ) ||
        z.state.toLowerCase().includes(zoneSearchQ) ||
        z.type.toLowerCase().includes(zoneSearchQ) ||
        z.sev.includes(zoneSearchQ)
    );
  }
  const sorted = [...fl].sort(
    (a, b) =>
      ({ critical: 0, high: 1, medium: 2, low: 3 })[a.sev] - ({ critical: 0, high: 1, medium: 2, low: 3 })[b.sev]
  );
  document.getElementById('zone-count').textContent = `${sorted.length} alert${sorted.length !== 1 ? 's' : ''}`;
  document.getElementById('map-list').innerHTML = sorted
    .map((z) => {
      const c = SEV_C[z.sev];
      const ti = types.find((t) => t.id === z.type) || { icon: '⚠️' };
      const bc = z.sev === 'critical' ? 'badge-red' : z.sev === 'high' ? 'badge-amber' : 'badge-gray';
      const loc = [z.lga || z.place, z.state].filter(Boolean).join(', ');
      return `<div class="alert-row" onclick="openZoneSheet('${z.id}')" style="margin-bottom:8px">
      <div class="alert-icon-box" style="background:${c}15;border:1px solid ${c}33">${ico(ti.icon)}</div>
      <div style="flex:1;min-width:0">
        <div class="alert-title">${escapeHtml(z.label)}</div>
        <div class="alert-meta">${escapeHtml(loc)} · ${z.reports} reports · ${escapeHtml(z.time)}</div>
      </div>
      <span class="badge ${bc}">${z.sev.toUpperCase()}</span>
    </div>`;
    })
    .join('');
}

function flyTo(id) {
  const z = zones.find((x) => x.id === id);
  if (!z || !map) return;
  map.flyTo([z.lat, z.lng], 11, { animate: true, duration: 1.2 });
  setTimeout(() => markers[id]?.circle?.openPopup(), 1300);
}

function filt(f) {
  curFilt = f;
  ['all', 'critical', 'high', 'medium'].forEach((k) => {
    const el = document.getElementById('c-' + k);
    if (el) el.classList.remove('on');
  });
  document.getElementById('c-' + f)?.classList.add('on');
  Object.entries(markers).forEach(([id, m]) => {
    const z = zones.find((x) => x.id === id);
    const show = f === 'all' || z?.sev === f;
    if (show) {
      m.circle.addTo(map);
      m.pulse.addTo(map);
    } else {
      map.removeLayer(m.circle);
      map.removeLayer(m.pulse);
    }
  });
  buildMapList();
}

function togglePin() {
  pinMode = !pinMode;
  const btn = document.getElementById('c-pin');
  const ban = document.getElementById('pin-banner');
  if (pinMode) {
    btn.classList.add('pin-on');
    btn.textContent = '✕ Cancel';
    ban.style.display = 'block';
    map.getContainer().style.cursor = 'crosshair';
  } else {
    btn.classList.remove('pin-on');
    btn.textContent = '📍 Pin Incident';
    ban.style.display = 'none';
    map.getContainer().style.cursor = '';
  }
}

function locateMe() {
  if (!map) return;
  if (uLat && uLng) {
    map.flyTo([uLat, uLng], 13, { animate: true, duration: 1 });
    toast('📡 Centered on your location');
  } else {
    toast('📡 Locating you…');
    const onPos = (p) => {
      uLat = p.coords.latitude;
      uLng = p.coords.longitude;
      map.flyTo([uLat, uLng], 13, { animate: true, duration: 1 });
    };
    navigator.geolocation?.getCurrentPosition(onPos, () => toast('Could not get location'));
  }
}

async function confirmZ(id) {
  try {
    await api(`/zones/${id}/confirm`, {
      method: 'PATCH',
      body: JSON.stringify({ device_id: state.deviceId }),
    });
    await refreshZones();
    toast('✓ Confirmed — community updated');
  } catch (e) {
    toast(e.message);
  }
}

async function clearZ(id) {
  try {
    await api(`/zones/${id}/clear`, {
      method: 'PATCH',
      body: JSON.stringify({ device_id: state.deviceId }),
    });
    await refreshZones();
    toast('✓ Thanks — helps the community know if safe');
  } catch (e) {
    toast(e.message);
  }
}

async function refreshZones() {
  const { zones: z } = await api('/zones?limit=200');
  zones = (z || []).map(adaptZone);
  window.zones = zones;
  syncMapMarkers();
  buildHomeList();
}
