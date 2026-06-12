/** SafeAlert app module — Geo helpers, UI utilities, zone adapters */
/* eslint-disable */
function isLocalDev() {
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '';
}

const NIGERIA_BOUNDS = { latMin: 4.0, latMax: 14.0, lngMin: 2.7, lngMax: 15.0 };
const DEFAULT_COORDS = { lat: 9.082, lng: 8.675 };
let gpsFallbackWarned = false;

function isNigeriaCoords(lat, lng) {
  return (
    lat != null &&
    lng != null &&
    lat >= NIGERIA_BOUNDS.latMin &&
    lat <= NIGERIA_BOUNDS.latMax &&
    lng >= NIGERIA_BOUNDS.lngMin &&
    lng <= NIGERIA_BOUNDS.lngMax
  );
}

/** Coords for API calls — Nigeria only; falls back to Abuja area if GPS is abroad. */
function effectiveCoords() {
  if (isNigeriaCoords(uLat, uLng)) return { lat: uLat, lng: uLng, fallback: false };
  if (!gpsFallbackWarned) {
    gpsFallbackWarned = true;
    toast('GPS is outside Nigeria — using Nigeria map center for this action', 'err');
  }
  return { ...DEFAULT_COORDS, fallback: true };
}

function friendlyError(err) {
  const msg = err?.message || String(err || 'Something went wrong');
  const status = err?.status;
  if (status === 401 || status === 403) return 'Sign in to use this feature';
  if (status === 409) return msg;
  if (status === 429) return 'Too many requests — wait a moment and try again';
  if (/network|fetch|failed to fetch|offline/i.test(msg)) return 'No connection — check data or Wi‑Fi';
  if (/timeout/i.test(msg)) return 'Request timed out — try again';
  if (/location|gps/i.test(msg)) return 'Turn on location to continue';
  return msg.length > 120 ? 'Something went wrong — try again' : msg;
}

function updateGuestSosBanner() {
  const el = document.getElementById('guest-sos-banner');
  if (!el) return;
  el.style.display = state.token ? 'none' : 'flex';
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function markSheetOpened() {
  sheetOpenedAt = Date.now();
  window.sheetOpenedAt = sheetOpenedAt;
}

function showLoader(on) {
  document.getElementById('loader')?.classList.toggle('show', !!on);
}

function setConn(ok) {
  const dot = document.getElementById('conn-dot');
  if (dot) {
    dot.classList.toggle('ok', ok);
    dot.title = ok ? 'Connected' : 'Offline';
  }
}

function markSynced() {
  const el = document.getElementById('last-sync');
  if (el) {
    const t = new Date();
    el.textContent = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}

function timeAgo(iso) {
  if (!iso) return 'recently';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function normState(name) {
  return String(name || '')
    .trim()
    .replace(/\s+state$/i, '');
}

function extractPlace(z) {
  if (z.lga) return String(z.lga).replace(/\s+lga$/i, '').trim();
  const d = z.description || z.label || '';
  const parts = d.split('—').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[1].split(',')[0].trim().slice(0, 48);
  return '';
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function zonesNearUser(km, source = zones) {
  if (!isNigeriaCoords(uLat, uLng)) return [];
  return source.filter((z) => haversineKm(uLat, uLng, z.lat, z.lng) <= km);
}

function adaptZone(z) {
  const place = extractPlace(z);
  return {
    id: z.id,
    lat: z.lat,
    lng: z.lng,
    label: z.label || z.type,
    state: z.state || 'Nigeria',
    lga: z.lga || place,
    place: place || normState(z.state) || 'Unknown area',
    type: z.type,
    sev: z.severity || 'medium',
    reports: z.reports || 0,
    vd: z.votes_danger || 0,
    vc: z.votes_cleared || 0,
    time: timeAgo(z.updated_at),
    ver: !!z.verified,
    desc: (z.description || '').slice(0, 200),
    source: z.source || 'community',
  };
}
