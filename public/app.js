/**
 * SafeAlert NG — app logic (wired to /v1 API)
 * UI design is in index.html
 * API base comes from SAFEALERT_API (or same-origin /v1 fallback)
 */
function resolveApiBase() {
  const { hostname, origin } = window.location;
  const isLocalWeb =
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '';

  // Browser on localhost → always use local API.
  if (isLocalWeb && origin && origin !== 'null') {
    return `${origin}/v1`;
  }

  if (window.SAFEALERT_API) {
    const u = String(window.SAFEALERT_API).replace(/\/$/, '');
    const isLocalConfig = /localhost|127\.0\.0\.1/.test(u);
    if (!isLocalConfig || isLocalWeb) {
      return u.endsWith('/v1') ? u : `${u}/v1`;
    }
  }

  return origin && origin !== 'null' ? `${origin}/v1` : 'http://localhost:3000/v1';
}

const API = resolveApiBase();

const TYPE_ICONS = {
  kidnapping: '👤',
  armed_robbery: '🔫',
  banditry: '⚠️',
  terror: '💥',
  roadblock: '🚧',
  suspicious: '👁️',
};

const UI_EMOJI = {
  home: '🏠',
  map: '🗺',
  insights: '📊',
  routes: '🛣',
  circle: '👥',
  report: '📍',
  profile: '👤',
  refresh: '🔄',
  share: '📤',
  alert: '⚠️',
  panic: '🆘',
  play: '▶',
  check: '✓',
  help: '🆘',
  submit: '🚨',
  back: '←',
  truck: '🚛',
  shop: '🛒',
  globe: '🌍',
  community: '👥',
  hotspot: '🔴',
  safe: '✅',
  locate: '📡',
};

function ico(name) {
  if (!name) return '⚠️';
  if (UI_EMOJI[name]) return UI_EMOJI[name];
  if (name.length <= 4 && /\p{Extended_Pictographic}/u.test(name)) return name;
  return TYPE_ICONS[name] || '⚠️';
}

const SEV_C = { critical: '#F03E3E', high: '#F79009', medium: '#FFB300', low: '#12B76A' };
const SEV_R = { critical: 22, high: 17, medium: 13, low: 9 };

const state = {
  token: localStorage.getItem('safealert_token'),
  otpToken: localStorage.getItem('safealert_otp_token'),
  sandboxMode: false,
  deviceId: localStorage.getItem('safealert_device') || `web-${crypto.randomUUID().slice(0, 12)}`,
  preferences: {
    help_nearby_enabled: false,
    help_nearby_radius_km: 5,
    notifications_enabled: true,
    estate_watch_enabled: true,
    data_saver: true,
  },
};

localStorage.setItem('safealert_device', state.deviceId);

function setOtpToken(token) {
  state.otpToken = token || null;
  if (state.otpToken) localStorage.setItem('safealert_otp_token', state.otpToken);
  else localStorage.removeItem('safealert_otp_token');
}

let map = null;
let mapReady = false;
const markers = {};
let userMk = null;
let uLat = null;
let uLng = null;
let curFilt = 'all';
let pinMode = false;
let selectedType = null;
let panicOn = false;
let panicSecs = 0;
let panicTmr = null;
let journeyOn = false;
let jSecs = 0;
let jTmr = null;
let journeyRating = 0;
let liveN = 0;
let zones = [];
let allZones = [];
let routes = [];
let circle = [];
let groups = [];
let types = [];
let holdTmr = null;
let holdProg = 0;
let toastTmr = null;
let sheetOpenedAt = 0;
window.sheetOpenedAt = 0;
let zoneSearchQ = '';
let refreshing = false;
let refreshIv = null;
let nearbyPanicIv = null;
let locationPingIv = null;
let gpsWatchId = null;
let routesLoaded = false;
let insightsLoaded = false;
let insightsDrill = { level: 'root', state: '', lga: '' };
let gpsZonesReloadTimer = null;
let groupsLoaded = false;
let settingsLoaded = false;
let currentScreen = 'home';

function ds() {
  return window.SafeAlertDataSaver || { isEnabled: () => false, zonesQuery: () => '?limit=80' };
}

function handleSessionExpired() {
  if (!state.token) return;
  state.token = null;
  localStorage.removeItem('safealert_token');
  setOtpToken(null);
  updateProfileUI();
  updateSignInBanner();
  toast('Session expired — sign in again (happens after server updates)', 'err');
  setTimeout(() => {
    if (typeof openProfile === 'function') openProfile();
  }, 500);
}

function maybeHandleAuthError(status, msg) {
  if (status !== 401 || !state.token) return false;
  if (!/invalid or expired token|missing authorization/i.test(String(msg || ''))) return false;
  handleSessionExpired();
  return true;
}

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(`${API}${path}`, { ...opts, headers, body: opts.body });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg =
      (Array.isArray(data?.messages) && data.messages.length ? data.messages.join('. ') : null) ||
      data?.error ||
      (typeof data === 'string' ? data : null) ||
      `Request failed (${res.status})`;
    if (maybeHandleAuthError(res.status, msg)) {
      const err = new Error('Session expired — please sign in again');
      err.status = res.status;
      err.sessionExpired = true;
      throw err;
    }
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function apiGetCached(path, cacheKey) {
  const etagKey = `safealert_etag_${cacheKey}`;
  const bodyKey = `safealert_body_${cacheKey}`;
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const etag = localStorage.getItem(etagKey);
  if (etag) headers['If-None-Match'] = etag;

  try {
    const res = await fetch(`${API}${path}`, { headers });
    if (res.status === 304) {
      const cached = localStorage.getItem(bodyKey);
      if (cached) return JSON.parse(cached);
    }
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    if (!res.ok) {
      const msg =
        data?.error || (typeof data === 'string' ? data : null) || `Request failed (${res.status})`;
      if (maybeHandleAuthError(res.status, msg)) {
        const err = new Error('Session expired — please sign in again');
        err.status = res.status;
        err.sessionExpired = true;
        throw err;
      }
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    const newEtag = res.headers.get('ETag');
    if (newEtag) {
      localStorage.setItem(etagKey, newEtag);
      localStorage.setItem(bodyKey, JSON.stringify(data));
    }
    return data;
  } catch (err) {
    const offline = window.SafeAlertOffline;
    if (offline?.tryFallback) {
      const fb = await offline.tryFallback(path);
      if (fb) {
        if (fb.data_note) showDataNote(fb.data_note);
        setConn(false);
        return fb;
      }
    }
    const stale = offline?.staleBody?.(cacheKey);
    if (stale) {
      showDataNote('Using saved data — connect for live updates.');
      setConn(false);
      return stale;
    }
    throw err;
  }
}

function applyStats(s) {
  window.SafeAlertUX = window.SafeAlertUX || {};
  window.SafeAlertUX.lastStats = s;
  const hotEl = document.getElementById('s-hot');
  if (hotEl) hotEl.textContent = s.critical_zones ?? zones.filter((z) => z.sev === 'critical').length;
  liveN = s.live_count ?? (s.active_panics ?? 0) + (s.critical_zones ?? 0);
  const liveEl = document.getElementById('live-n');
  if (liveEl) liveEl.textContent = String(liveN);
  const liveLbl = document.getElementById('live-lbl');
  if (liveLbl) {
    liveLbl.textContent = 'ACTIVE';
    liveLbl.title = `${s.active_panics ?? 0} active panic(s) · ${s.critical_zones ?? 0} critical zone(s)`;
  }
  if (currentScreen === 'insights') buildInsights();
}

function formatTypeLabel(type) {
  return String(type || 'unknown')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatSourceLabel(src) {
  const map = {
    ucdp: 'UCDP (verified)',
    acled: 'ACLED (live)',
    community: 'Community reports',
    user_report: 'User reports',
    import: 'Imported data',
  };
  return map[src] || formatTypeLabel(src);
}

function renderDashBars(entries, color = 'var(--green)') {
  if (!entries.length) {
    return '<p style="font-size:12px;color:var(--text3)">No data yet</p>';
  }
  const max = Math.max(...entries.map((e) => e.value), 1);
  return entries
    .map(
      (e) => `<div class="dash-bar-row">
  <span class="dash-bar-lbl" title="${escapeHtml(e.label)}">${escapeHtml(e.label)}</span>
  <div class="dash-bar-track"><div class="dash-bar-fill" style="width:${Math.round((e.value / max) * 100)}%;background:${e.color || color}"></div></div>
  <span class="dash-bar-val">${e.value}</span>
</div>`
    )
    .join('');
}

function generateInsightLines(s, nearbyCount) {
  const lines = [];
  const total = s.total_active_zones || 0;
  const critical = s.critical_zones || 0;
  const verified = s.verified_zones || 0;
  const panics = s.active_panics || 0;

  if (panics > 0) {
    lines.push(`<strong>${panics} active panic${panics > 1 ? 's' : ''}</strong> — someone may need help nearby.`);
  }
  if (critical > 0) {
    lines.push(`<strong>${critical} critical alert${critical > 1 ? 's' : ''}</strong> — avoid these areas if you can.`);
  } else if (total > 0) {
    lines.push('No critical zones right now — stay aware of high-risk areas on the map.');
  }
  if (total > 0 && verified > 0) {
    const pct = Math.round((verified / total) * 100);
    lines.push(`${pct}% of active alerts are <strong>verified</strong> (${verified} of ${total}).`);
  }
  const topStates = s.top_states || [];
  if (topStates[0]) {
    lines.push(`Most reported activity: <strong>${escapeHtml(topStates[0].name)}</strong> (${topStates[0].count} alerts).`);
  }
  const byType = s.by_type || {};
  const topType = Object.entries(byType)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])[0];
  if (topType) {
    lines.push(`Top incident type: <strong>${escapeHtml(formatTypeLabel(topType[0]))}</strong> (${topType[1]}).`);
  }
  if (nearbyCount > 0) {
    lines.push(`<strong>${nearbyCount}</strong> alert${nearbyCount > 1 ? 's' : ''} within ~50 km of you.`);
  }
  if (!lines.length) {
    lines.push('Community data is still building — report incidents or check back soon.');
  }
  return lines.join(' ');
}

function countZonesNearUser(km = 50) {
  const src = allZones.length ? allZones : zones;
  return zonesNearUser(km, src).length;
}

function buildInsights() {
  const body = document.getElementById('insights-body');
  const loading = document.getElementById('insights-loading');
  if (!body) return;

  const s = window.SafeAlertUX?.lastStats || {};
  loading.style.display = 'none';
  body.style.display = 'block';

  const nearbyCount = countZonesNearUser(50);
  const banner = document.getElementById('insight-banner');
  if (banner) banner.innerHTML = generateInsightLines(s, nearbyCount);

  const kpis = document.getElementById('insights-kpis');
  if (kpis) {
    kpis.innerHTML = `
      <div class="insight-kpi"><div class="insight-kpi-num" style="color:var(--red)">${s.total_active_zones ?? 0}</div><div class="insight-kpi-lbl">${t('kpi_active_zones')}</div></div>
      <div class="insight-kpi"><div class="insight-kpi-num" style="color:var(--amber)">${s.total_reports ?? 0}</div><div class="insight-kpi-lbl">${t('kpi_reports')}</div></div>
      <div class="insight-kpi"><div class="insight-kpi-num" style="color:var(--green)">${s.verified_zones ?? 0}</div><div class="insight-kpi-lbl">${t('kpi_verified')}</div></div>
      <div class="insight-kpi"><div class="insight-kpi-num" style="color:var(--blue)">${s.live_count ?? 0}</div><div class="insight-kpi-lbl">${t('kpi_live')}</div></div>`;
  }

  const crit = s.critical_zones || 0;
  const high = s.high_zones || 0;
  const med = s.medium_zones || 0;
  const low = s.low_zones || 0;
  const sevTotal = crit + high + med + low || 1;
  const stack = document.getElementById('insights-sev-stack');
  if (stack) {
    stack.innerHTML = `
      <div class="sev-seg" style="flex:${crit};background:var(--red)" title="Critical"></div>
      <div class="sev-seg" style="flex:${high};background:var(--amber)" title="High"></div>
      <div class="sev-seg" style="flex:${med};background:#FFB300" title="Medium"></div>
      <div class="sev-seg" style="flex:${low};background:var(--green)" title="Low"></div>`;
  }
  const legend = document.getElementById('insights-sev-legend');
  if (legend) {
    legend.innerHTML = [
      ['Critical', crit, 'var(--red)'],
      ['High', high, 'var(--amber)'],
      ['Medium', med, '#FFB300'],
      ['Low', low, 'var(--green)'],
    ]
      .map(
        ([lbl, n, c]) =>
          `<span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${c};margin-right:4px"></span>${lbl}: ${n}</span>`
      )
      .join('');
  }

  const typeEntries = Object.entries(s.by_type || {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([type, value]) => ({
      label: formatTypeLabel(type),
      value,
      color: type === 'banditry' || type === 'terror' ? 'var(--red)' : type === 'armed_robbery' ? 'var(--amber)' : 'var(--blue)',
    }));
  const typesEl = document.getElementById('insights-types');
  if (typesEl) typesEl.innerHTML = renderDashBars(typeEntries);

  const stateEntries = (s.top_states || []).map((st) => ({
    label: st.name,
    value: st.count,
    color: 'var(--amber)',
  }));
  const statesEl = document.getElementById('insights-states');
  if (statesEl) {
    statesEl.innerHTML = stateEntries.length
      ? renderDashBars(stateEntries, 'var(--amber)')
      : '<p style="font-size:12px;color:var(--text3)">No state breakdown yet</p>';
  }

  const sourceEntries = Object.entries(s.by_source || {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([src, value]) => ({ label: formatSourceLabel(src), value, color: 'var(--blue)' }));
  const sourcesEl = document.getElementById('insights-sources');
  if (sourcesEl) {
    sourcesEl.innerHTML = sourceEntries.length
      ? renderDashBars(sourceEntries, 'var(--blue)')
      : '<p style="font-size:12px;color:var(--text3)">Community reports only</p>';
  }

  const safeRoutes = routes.filter((r) => r.score >= 65).length;
  const riskyRoutes = routes.filter((r) => r.score < 35).length;
  const routesEl = document.getElementById('insights-routes');
  if (routesEl) {
    if (!routes.length) {
      routesEl.innerHTML =
        '<p style="font-size:12px;color:var(--text2);line-height:1.5">No traveller-rated routes yet. Scores appear when people share journey safety.</p>';
    } else {
      routesEl.innerHTML = `
        <div style="display:flex;gap:16px;margin-bottom:10px">
          <div><span style="font-size:22px;font-weight:900;color:var(--green)">${safeRoutes}</span><div style="font-size:10px;color:var(--text3)">${t('routes_safe')}</div></div>
          <div><span style="font-size:22px;font-weight:900;color:var(--red)">${riskyRoutes}</span><div style="font-size:10px;color:var(--text3)">${t('routes_risky')}</div></div>
          <div><span style="font-size:22px;font-weight:900;color:var(--text)">${routes.length}</span><div style="font-size:10px;color:var(--text3)">${t('routes_total')}</div></div>
        </div>
        ${renderDashBars(
          routes
            .slice()
            .sort((a, b) => a.score - b.score)
            .slice(0, 5)
            .map((r) => ({
              label: `${r.from} → ${r.to}`,
              value: r.score,
              color: r.score >= 65 ? 'var(--green)' : r.score < 35 ? 'var(--red)' : 'var(--amber)',
            })),
          'var(--green)'
        )}`;
    }
  }
  const safeEl = document.getElementById('s-safe');
  if (safeEl) safeEl.textContent = String(safeRoutes);

  const nearbyEl = document.getElementById('insights-nearby');
  if (nearbyEl) {
    if (!isNigeriaCoords(uLat, uLng)) {
      nearbyEl.innerHTML =
        '<div class="card card-sm"><p style="font-size:12px;color:var(--text2)">Enable location to see alerts near you.</p></div>';
    } else if (!nearbyCount) {
      nearbyEl.innerHTML =
        '<div class="card card-sm"><p style="font-size:12px;color:var(--green);font-weight:600">No active alerts within 50 km — relatively quiet around you.</p></div>';
    } else {
      const near = zones
        .filter((z) => {
          const R = 6371;
          const dLat = ((z.lat - uLat) * Math.PI) / 180;
          const dLng = ((z.lng - uLng) * Math.PI) / 180;
          const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos((uLat * Math.PI) / 180) * Math.cos((z.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
          return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) <= 50;
        })
        .sort((a, b) => {
          const rank = { critical: 0, high: 1, medium: 2, low: 3 };
          return (rank[a.sev] ?? 9) - (rank[b.sev] ?? 9);
        })
        .slice(0, 5);
      nearbyEl.innerHTML = near
        .map(
          (z) => `<div class="alert-row" onclick="flyTo(${z.lat},${z.lng});go('map')">
  <div class="alert-icon-box" style="background:var(--surface2)">${ico(z.type)}</div>
  <div style="flex:1;min-width:0">
    <div class="alert-title">${escapeHtml(z.label)}</div>
    <div class="alert-meta">${escapeHtml(z.state)} · ${z.reports} reports · ${z.time}</div>
  </div>
  <span class="badge badge-${z.sev === 'critical' ? 'red' : z.sev === 'high' ? 'amber' : 'gray'}">${z.sev.toUpperCase()}</span>
</div>`
        )
        .join('');
    }
  }

  const updated = document.getElementById('insights-updated');
  if (updated && s.last_updated) {
    const d = new Date(s.last_updated);
    updated.textContent = `${t('last_updated')}: ${d.toLocaleString()}`;
  }
}

async function loadInsightsData() {
  const loading = document.getElementById('insights-loading');
  const body = document.getElementById('insights-body');
  if (loading) loading.style.display = 'block';
  if (body) body.style.display = 'none';
  insightsDrill = { level: 'root', state: '', lga: '' };
  await loadStatsOnly();
  await loadZonesData();
  if (!allZones.length) await loadAllZonesData().catch(() => {});
  if (!routesLoaded) {
    try {
      await loadRoutesData();
    } catch {
      /* optional */
    }
  }
  insightsLoaded = true;
  buildInsights();
}

function showDataNote(note) {
  if (!note) return;
  let bar = document.getElementById('data-status-banner');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'data-status-banner';
    bar.style.cssText =
      'margin:0 18px 10px;padding:10px 12px;font-size:11px;line-height:1.45;background:var(--amber-soft);border:1px solid var(--amber-border);border-radius:var(--r-sm);color:var(--amber)';
    const home = document.getElementById('screen-home');
    if (home) home.insertBefore(bar, home.querySelector('.card'));
  }
  bar.textContent = note;
  bar.style.display = 'block';
}

async function loadStatsOnly() {
  const statsRes = await apiGetCached('/stats', 'stats');
  applyStats(statsRes.stats || {});
  if (statsRes.data_note) showDataNote(statsRes.data_note);
}

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

function signInRequiredToast() {
  const msg = state.sandboxMode
    ? 'Sign in: tap profile (top right) → enter phone → Send OTP → Sign in'
    : 'Sign in required — tap profile in the header';
  toast(msg, 'err');
  openProfile();
}

async function ensureAuth() {
  if (state.token) return true;
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    try {
      const reqOtp = await api('/auth/request-otp', {
        method: 'POST',
        body: JSON.stringify({ phone: '08012345678' }),
      });
      setOtpToken(reqOtp.otp_token);
      const d = await api('/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({
          phone: '08012345678',
          otp: '123456',
          ...(state.otpToken ? { otp_token: state.otpToken } : {}),
        }),
      });
      state.token = d.token;
      localStorage.setItem('safealert_token', d.token);
      setOtpToken(null);
      return true;
    } catch {
      signInRequiredToast();
      return false;
    }
  }
  if (state.sandboxMode) {
    const phone = document.getElementById('p-phone')?.value?.trim() || localStorage.getItem('safealert_phone');
    const otp = document.getElementById('p-otp')?.value?.trim().replace(/\D/g, '');
    if (phone && otp?.length === 6) {
      try {
        const d = await api('/auth/verify-otp', {
          method: 'POST',
          body: JSON.stringify({ phone, otp, ...(state.otpToken ? { otp_token: state.otpToken } : {}) }),
        });
        state.token = d.token;
        localStorage.setItem('safealert_token', d.token);
        localStorage.setItem('safealert_phone', phone);
        setOtpToken(null);
        updateProfileUI();
        await loadPreferences();
        await loadData();
        buildCircle();
        toast('Signed in', 'ok');
        return true;
      } catch {
        /* fall through to profile */
      }
    }
  }
  signInRequiredToast();
  return false;
}

async function loadSettingsIfNeeded() {
  if (settingsLoaded && types.length) return;
  const settingsRes = await apiGetCached('/settings', 'settings');
  types = (settingsRes.settings?.incident_types || []).map((id) => ({
    id,
    label: id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    icon: TYPE_ICONS[id] || '⚠️',
  }));
  settingsLoaded = true;
}

async function loadZonesData() {
  const zonesRes = await apiGetCached(`/zones${ds().zonesQuery()}`, 'zones');
  zones = (zonesRes.zones || []).map(adaptZone);
  window.zones = zones;
  if (zonesRes.data_note) showDataNote(zonesRes.data_note);
  syncMapMarkers();
  updateMapPlaceholderCount();
}

async function loadMapZones() {
  const zonesRes = await api(`/zones${ds().zonesQuery('map')}`);
  zones = (zonesRes.zones || []).map(adaptZone);
  window.zones = zones;
  syncMapMarkers();
  updateMapPlaceholderCount();
}

async function loadAllZonesData(stateName) {
  const q = stateName
    ? `?state=${encodeURIComponent(stateName)}&limit=250`
    : ds().zonesQuery('full');
  const cacheKey = stateName ? `zones-state-${stateName}` : 'zones-full';
  const zonesRes = await apiGetCached(`/zones${q}`, cacheKey);
  const batch = (zonesRes.zones || []).map(adaptZone);
  if (stateName) {
    const merged = new Map((allZones.length ? allZones : zones).map((z) => [z.id, z]));
    batch.forEach((z) => merged.set(z.id, z));
    allZones = [...merged.values()];
  } else {
    allZones = batch;
  }
  window.allZones = allZones;
}

function syncMapMarkers() {
  if (!map) return;
  const ids = new Set(zones.filter((z) => Number.isFinite(z.lat) && Number.isFinite(z.lng)).map((z) => z.id));
  Object.keys(markers).forEach((id) => {
    if (!ids.has(id)) {
      map.removeLayer(markers[id].circle);
      map.removeLayer(markers[id].pulse);
      delete markers[id];
    }
  });
  zones.forEach((z) => {
    if (Number.isFinite(z.lat) && Number.isFinite(z.lng)) addMk(z);
  });
  buildMapList();
}

function updateMapPlaceholderCount() {
  const el = document.getElementById('map-alert-count');
  if (!el) return;
  const n = allZones.length || zones.length;
  el.textContent = n
    ? `${n} safety alert${n !== 1 ? 's' : ''} on the map — tap to view`
    : 'Loading community alerts…';
}

async function loadRoutesData() {
  const routesRes = await apiGetCached('/routes', 'routes');
  routes = (routesRes.routes || []).map((r) => ({
    from: r.from,
    to: r.to,
    score: r.safety_score ?? 50,
    travelers: r.travelers_last_2h ?? 0,
    via: r.via || '',
    updated: timeAgo(r.last_updated),
    warn: null,
  }));
  routes.forEach((r) => {
    if (r.score < 35) r.warn = 'CRITICAL DANGER — Community strongly advises avoiding this route completely.';
    else if (r.score < 65) r.warn = 'HIGH RISK — Use extreme caution on this route.';
  });
  routesLoaded = true;
  const elSafe = document.getElementById('s-safe');
  if (elSafe) elSafe.textContent = routes.filter((r) => r.score > 65).length;
}

async function loadGroupsData() {
  const groupsRes = await apiGetCached('/groups', 'groups');
  groups = (groupsRes.groups || []).map((g, i) => ({
    id: g.id,
    name: g.name,
    members: g.member_count || 0,
    icon: g.icon || ['🚛', '🛒', '🌍', '👥'][i % 4],
    alerts: 0,
    source: g.source || '',
    verified: !!g.verified_partner,
  }));
  window.groupsApiNote = groupsRes.note || '';
  groupsLoaded = true;
}

async function loadCircleData() {
  if (state.token) {
    try {
      const { circle: c } = await api('/user/circle');
      const store = circlePhoneStore();
      circle = (c || []).map((m) => ({
        name: m.name,
        rel: m.relation,
        relation: m.relation,
        phone: store[m.name] || m.phone,
        status: 'safe',
        icon: '🏠',
        last: 'Circle member',
      }));
      window.SafeAlertCitizenSOS?.cacheCircle?.(circle);
    } catch (_) {
      /* ignore */
    }
  }
  if (!circle.length && !state.token) {
    circle = [{ name: 'Sign in', rel: 'Tap profile', status: 'unknown', icon: '👤', last: 'Add trusted contacts' }];
  }
  const elCircle = document.getElementById('s-circle');
  if (elCircle) elCircle.textContent = circle.length;
}

async function loadData(opts = {}) {
  const full = !ds().isEnabled() || opts.full;
  await loadStatsOnly();
  await loadZonesData();
  loadAllZonesData().catch(() => {});
  await loadSettingsIfNeeded();

  if (full) {
    await Promise.all([loadRoutesData(), loadGroupsData(), loadCircleData()]);
  } else {
    if (currentScreen === 'routes' || !ds().isEnabled()) await loadRoutesData();
    if (currentScreen === 'circle' || !ds().isEnabled()) {
      await loadGroupsData();
      await loadCircleData();
    }
  }

  setConn(true);
  markSynced();
}

async function refreshAll() {
  if (refreshing) return;
  if (document.visibilityState === 'hidden') return;
  refreshing = true;
  const btn = document.getElementById('btn-refresh');
  btn?.classList.add('spin');
  showLoader(true);
  try {
    if (ds().isEnabled()) {
      await loadStatsOnly();
      await loadZonesData();
      if (currentScreen === 'routes') await loadRoutesData();
      if (currentScreen === 'insights') await loadInsightsData();
      if (currentScreen === 'circle') {
        await loadGroupsData();
        await loadCircleData();
      }
    } else {
      await loadData({ full: true });
    }
    if (mapReady) await refreshZones();
    buildHomeList();
    if (routesLoaded) {
      buildRoutes();
      filterRoutes();
    }
    if (groupsLoaded) {
      buildCircle();
      buildGroups();
    }
    buildTypeGrid();
    if (currentScreen === 'insights') buildInsights();
    if (currentScreen === 'circle') await loadResources();
    await loadActiveCheckIn();
    syncNearbyPanicCard();
    toast('↻ Data refreshed', 'ok');
  } catch (e) {
    setConn(false);
    toast(e.message || 'Refresh failed', 'err');
  } finally {
    refreshing = false;
    btn?.classList.remove('spin');
    showLoader(false);
  }
}

function searchZones(q) {
  zoneSearchQ = (q || '').trim().toLowerCase();
  buildMapList();
}

function filterRoutes() {
  const fromQ = (document.getElementById('route-search')?.value || '').trim().toLowerCase();
  const toQ = (document.getElementById('route-search-to')?.value || '').trim().toLowerCase();
  const filtered = routes.filter((r) => {
    const matchFrom = !fromQ || r.from.toLowerCase().includes(fromQ);
    const matchTo = !toQ || r.to.toLowerCase().includes(toQ);
    return matchFrom && matchTo;
  });
  renderRoutes(filtered);
}

function renderRoutes(list) {
  const empty =
    list.length === 0
      ? '<div class="card card-sm" style="text-align:center;color:var(--text2);font-size:13px">No routes match your search</div>'
      : '';
  document.getElementById('routes-list').innerHTML =
    empty +
    list
      .map((r) => {
        const c = r.score > 65 ? '#12B76A' : r.score > 35 ? '#F79009' : '#F03E3E';
        const circ = 2 * Math.PI * 24;
        const fill = (r.score / 100) * circ;
        const wClass = r.score > 65 ? 'route-safe' : r.score > 35 ? 'route-caution' : 'route-danger';
        const wTxt = r.warn || (r.score > 65 ? '✓ Route reported clear — safe to travel' : null);
        const prefix = wTxt && !wTxt.startsWith('✓') && !wTxt.startsWith('⚠') ? (r.score > 65 ? '✓ ' : '⚠️ ') : '';
        return `<div class="route-card new-flash">
      <div class="route-head">
        <div class="score-wrap">
          <svg width="60" height="60"><circle cx="30" cy="30" r="24" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="4"/><circle cx="30" cy="30" r="24" fill="none" stroke="${c}" stroke-width="4" stroke-dasharray="${fill} ${circ}" stroke-linecap="round"/></svg>
          <div class="score-num" style="color:${c}">${r.score}</div>
        </div>
        <div style="flex:1;min-width:0">
          <div class="route-name">${escapeHtml(r.from)} → ${escapeHtml(r.to)}</div>
          <div class="route-via">via ${escapeHtml(r.via || '—')}</div>
          <div class="route-pills">
            <span class="route-pill">👥 ${r.travelers}</span>
            <span class="route-pill">🕐 ${escapeHtml(r.updated)}</span>
          </div>
        </div>
      </div>
      ${wTxt ? `<div class="route-warn ${wClass}">${prefix}${escapeHtml(wTxt)}</div>` : ''}
    </div>`;
      })
      .join('');
}

function openZoneSheet(id) {
  const z = zones.find((x) => x.id === id);
  if (!z) return;
  const c = SEV_C[z.sev] || SEV_C.medium;
  const ti = types.find((t) => t.id === z.type) || { icon: '⚠️', label: z.type };
  const vTotal = (z.vd || 0) + (z.vc || 0) || 1;
  const vPct = Math.round(((z.vd || 0) / vTotal) * 100);
  document.getElementById('zone-sheet-body').innerHTML = `
    <div class="sheet-title">${escapeHtml(z.label)}</div>
    <div class="sheet-sub">${escapeHtml(z.state)} · ${escapeHtml(z.time)} · ${z.reports} reports · ${z.ver ? '✓ Community verified' : `${z.reports}/3 confirmations needed`}</div>
    <span class="badge badge-${z.sev === 'critical' ? 'red' : z.sev === 'high' ? 'amber' : 'gray'}">${z.sev.toUpperCase()}</span>
    <div style="margin:14px 0;font-size:12px;color:var(--text2)">${escapeHtml(ti.label || z.type)}</div>
    <div style="font-size:10px;color:var(--text2);margin-bottom:6px;display:flex;justify-content:space-between">
      <span>⚠️ ${z.vd} danger</span><span>✓ ${z.vc} cleared</span>
    </div>
    <div class="pu-bar"><div class="pu-bar-fill" style="width:${vPct}%;background:${c}"></div></div>
    <div class="sheet-actions">
      <button class="btn btn-outline btn-sm" onclick="confirmZ('${z.id}');closeSheets()">Still dangerous</button>
      <button class="btn btn-green btn-sm" onclick="clearZ('${z.id}');closeSheets()">Area cleared</button>
      <button class="btn btn-outline btn-sm" style="color:var(--text3)" onclick="reportFalseZone('${z.id}');closeSheets()">Flag false report</button>
    </div>
    <button class="btn btn-outline btn-sm" style="margin-top:10px;width:100%" onclick="go('map');closeSheets();setTimeout(()=>flyTo('${z.id}'),200)">${t('view_on_map')}</button>
    <button class="btn btn-outline btn-sm" style="margin-top:8px;width:100%" onclick="shareAlertById('${z.id}')">📤 ${t('share_alert')}</button>`;
  markSheetOpened();
  document.getElementById('sheet-bg').classList.add('show');
  document.getElementById('zone-sheet').classList.add('show');
}

function clearStuckOverlays() {
  document.getElementById('loader')?.classList.remove('show');
  const bg = document.getElementById('sheet-bg');
  const anySheetOpen = document.querySelector('.sheet.show');
  if (bg && !anySheetOpen) bg.classList.remove('show');
}

function onSheetBackdropClick(e) {
  if (e.target !== e.currentTarget) return;
  if (Date.now() - sheetOpenedAt < 400) return;
  closeSheets();
}

function closeSheets() {
  if (Date.now() - sheetOpenedAt < 400) return;
  document.getElementById('sheet-bg')?.classList.remove('show');
  document.getElementById('zone-sheet')?.classList.remove('show');
  document.getElementById('profile-sheet')?.classList.remove('show');
  document.getElementById('journey-end-sheet')?.classList.remove('show');
  showLoader(false);
}

function openProfile() {
  showLoader(false);
  try {
    updateProfileUI();
    window.SafeAlertZeroBudget?.applyPublicConfig?.(window.SAFEALERT_PUBLIC_CONFIG || {});
  } catch (err) {
    console.warn('[SafeAlert] openProfile setup:', err);
  }
  markSheetOpened();
  document.getElementById('sheet-bg')?.classList.add('show');
  document.getElementById('profile-sheet')?.classList.add('show');
  if (typeof hydrateIcons === 'function') hydrateIcons(document.getElementById('profile-sheet'));
  setTimeout(() => document.getElementById('p-phone')?.focus(), 350);
}

function openCircleAdd() {
  if (!state.token) {
    toast('Sign in to add circle members', 'err');
    openProfile();
    return;
  }
  openProfile();
}

async function loadPreferences() {
  if (!state.token) return;
  try {
    const { preferences: p } = await api('/user/preferences');
    state.preferences = { ...state.preferences, ...p };
    if (p.language) {
      localStorage.setItem('safealert_lang', p.language);
      if (typeof applyI18n === 'function') applyI18n();
    }
    if (p.data_saver !== undefined) ds().setEnabled(!!p.data_saver);
    syncPreferencesUI();
    syncHelpNearbyPing();
  } catch (_) {
    /* ignore */
  }
}

const RESPONDER_SKILLS = [
  { id: 'first_aid', label: 'First aid' },
  { id: 'escort', label: 'Escort' },
  { id: 'mechanic', label: 'Mechanic' },
  { id: 'driver', label: 'Driver' },
  { id: 'security', label: 'Security' },
  { id: 'translator', label: 'Translator' },
];

function syncDataSaverUI() {
  const cb = document.getElementById('pref-data-saver');
  const on = ds().isEnabled();
  if (cb) cb.checked = on;
  document.documentElement.classList.toggle('data-saver', on);
  const banner = document.getElementById('data-saver-banner');
  if (banner) banner.style.display = on ? 'block' : 'none';
  if (on && !ds().shouldLoadGoogleFonts?.()) {
    document.getElementById('font-plus-jakarta')?.setAttribute('media', 'print');
  } else {
    document.getElementById('font-plus-jakarta')?.setAttribute('media', 'all');
  }
}

async function saveDataSaver() {
  const on = !!document.getElementById('pref-data-saver')?.checked;
  ds().setEnabled(on);
  syncDataSaverUI();
  rescheduleRefreshTimers();
  syncHelpNearbyPing();
  if (state.token) {
    try {
      await api('/user/preferences', {
        method: 'PUT',
        body: JSON.stringify({ data_saver: on }),
      });
    } catch (_) {
      /* ignore */
    }
  }
  toast(on ? 'Data Saver on — less background usage' : 'Data Saver off — live updates', 'ok');
}

function syncPreferencesUI() {
  if (state.preferences.data_saver !== undefined) {
    ds().setEnabled(!!state.preferences.data_saver);
  }
  syncDataSaverUI();
  const voiceCb = document.getElementById('pref-voice-mode');
  if (voiceCb && window.SafeAlertVoice) voiceCb.checked = window.SafeAlertVoice.isEnabled();
  const iconCb = document.getElementById('pref-icon-only');
  if (iconCb && window.SafeAlertIconMode) iconCb.checked = window.SafeAlertIconMode.isEnabled();
  const lang = document.getElementById('pref-language');
  if (lang) lang.value = state.preferences.language || localStorage.getItem('safealert_lang') || 'en';
  const night = document.getElementById('pref-night-mode');
  if (night) night.checked = !!state.preferences.night_mode;
  const women = document.getElementById('pref-women-mode');
  if (women) women.checked = !!state.preferences.women_mode;
  document.documentElement.classList.toggle('night-mode', !!state.preferences.night_mode);
  const cb = document.getElementById('pref-help-nearby');
  const range = document.getElementById('pref-help-radius');
  const lbl = document.getElementById('pref-radius-lbl');
  if (!cb || !range) return;
  cb.checked = !!state.preferences.help_nearby_enabled;
  const ew = document.getElementById('pref-estate-watch');
  if (ew) ew.checked = state.preferences.estate_watch_enabled !== false;
  range.value = state.preferences.help_nearby_radius_km || 5;
  if (lbl) lbl.textContent = range.value;

  const rav = document.getElementById('pref-responder-available');
  if (rav) rav.checked = !!state.preferences.responder_available;
  const skillsEl = document.getElementById('responder-skills');
  if (skillsEl) {
    const selected = new Set(state.preferences.responder_skills || []);
    skillsEl.innerHTML = RESPONDER_SKILLS.map(
      (s) =>
        `<label style="font-size:11px;padding:6px 10px;border-radius:20px;border:1px solid var(--border);cursor:pointer;background:${selected.has(s.id) ? 'var(--green-soft)' : 'transparent'}">
          <input type="checkbox" data-skill="${s.id}" ${selected.has(s.id) ? 'checked' : ''} style="margin-right:4px"/>${s.label}
        </label>`
    ).join('');
  }
  syncNearbyPanicCard();
}

async function savePreferences() {
  if (!state.token) return toast('Sign in first', 'err');
  const help_nearby_enabled = !!document.getElementById('pref-help-nearby')?.checked;
  const estate_watch_enabled = !!document.getElementById('pref-estate-watch')?.checked;
  const help_nearby_radius_km = parseInt(document.getElementById('pref-help-radius')?.value || '5', 10);
  const lbl = document.getElementById('pref-radius-lbl');
  if (lbl) lbl.textContent = String(help_nearby_radius_km);
  try {
    const d = await api('/user/preferences', {
      method: 'PUT',
      body: JSON.stringify({ help_nearby_enabled, help_nearby_radius_km, estate_watch_enabled }),
    });
    state.preferences = d.preferences || state.preferences;
    if (help_nearby_enabled) {
      toast('Help nearby on — allow notifications for push alerts', 'ok');
      if (window.SafeAlertFCM && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    }
    syncHelpNearbyPing();
    if (!help_nearby_enabled) toast('Help nearby alerts off', 'ok');
  } catch (e) {
    toast(e.message, 'err');
  }
}

function syncHelpNearbyPing() {
  clearInterval(locationPingIv);
  if (!state.token || !state.preferences.help_nearby_enabled) return;
  const intervalMs = ds().helpNearbyPingMs();
  pingLocation();
  locationPingIv = setInterval(pingLocation, intervalMs);
}

function updateProfileUI() {
  const out = document.getElementById('profile-signed-out');
  const inn = document.getElementById('profile-signed-in');
  const card = document.getElementById('profile-card');
  if (state.token) {
    out.style.display = 'none';
    inn.style.display = 'block';
    card.innerHTML = `<div style="font-size:14px;font-weight:700">Signed in</div>
      <div style="font-size:11px;color:var(--text2);margin-top:4px">Device ${escapeHtml(state.deviceId.slice(0, 16))}…</div>`;
    syncPreferencesUI();
  } else {
    out.style.display = 'block';
    inn.style.display = 'none';
  }
  window.SafeAlertZeroBudget?.renderGuestBanner?.(window.SAFEALERT_PUBLIC_CONFIG || {});
  syncCircleSetupNudge();
}

function syncCircleSetupNudge() {
  const el = document.getElementById('circle-setup-nudge');
  if (!el) return;
  const contacts = window.SafeAlertCitizenSOS?.getCircleContacts?.() || [];
  const show = state.token && contacts.length < 2;
  el.style.display = show ? 'block' : 'none';
}

let otpBusy = false;

async function requestOtp() {
  if (otpBusy) return;
  const phone = document.getElementById('p-phone')?.value?.trim();
  const btn = document.getElementById('btn-send-otp');
  const hint = document.getElementById('auth-hint');
  if (!phone) return toast('Enter your phone number', 'err');

  otpBusy = true;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Sending…';
  }
  if (hint) hint.textContent = 'Requesting OTP…';

  localStorage.setItem('safealert_phone', phone);

  try {
    const d = await api('/auth/request-otp', { method: 'POST', body: JSON.stringify({ phone }) });
    setOtpToken(d.otp_token);
    if (d.sandbox_otp) {
      const el = document.getElementById('p-otp');
      if (el) el.value = d.sandbox_otp;
      if (hint) {
        const sandboxNote = d.at_sandbox
          ? `<br/><span style="font-size:10px;color:var(--text3)">Africa's Talking sandbox — whitelist 080… in AT dashboard for real SMS. Code is always shown here.</span>`
          : '';
        hint.innerHTML = `Your code: <strong style="color:var(--green)">${escapeHtml(d.sandbox_otp)}</strong> — tap <strong>Sign in</strong>${sandboxNote}`;
      }
      toast(`Sandbox code ${d.sandbox_otp} — tap Sign in`, 'ok');
    } else if (state.sandboxMode) {
      if (hint) {
        hint.textContent =
          'Sandbox: no code returned. Hard-refresh the page, then Send OTP again. Try 123456 if your server uses a fixed test OTP.';
      }
      toast('No code returned — hard refresh (Cmd+Shift+R) and try again', 'err');
    } else {
      const devHint = isLocalDev() ? ' (dev: try 123456 if configured)' : '';
      toast((d.message || 'OTP sent') + devHint, 'ok');
      if (hint) hint.textContent = 'Check SMS, then tap Sign in.';
    }
    if (d.sms_warning) toast(d.sms_warning, 'err');
  } catch (e) {
    setOtpToken(null);
    if (hint) hint.textContent = e.message || 'Could not send OTP. Try again.';
    toast(e.message || 'Could not send OTP', 'err');
  } finally {
    otpBusy = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Send OTP';
    }
  }
}

async function verifyOtp() {
  if (otpBusy) return;
  const phone = document.getElementById('p-phone')?.value?.trim();
  const otp = document.getElementById('p-otp')?.value?.trim().replace(/\D/g, '');
  const btn = document.getElementById('btn-verify-otp');
  if (!phone || !otp) return toast('Phone and OTP required', 'err');
  if (otp.length !== 6) return toast('Enter the 6-digit OTP from SMS', 'err');

  otpBusy = true;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Signing in…';
  }

  try {
    const d = await api('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ phone, otp, ...(state.otpToken ? { otp_token: state.otpToken } : {}) }),
    });
    state.token = d.token;
    localStorage.setItem('safealert_token', d.token);
    localStorage.setItem('safealert_phone', phone);
    setOtpToken(null);
    updateProfileUI();
    await loadPreferences();
    await loadData();
    buildCircle();
    closeSheets();
    updateSignInBanner();
    window.dispatchEvent(new CustomEvent('safealert:signed-in'));
    toast('Welcome — you are signed in', 'ok');
  } catch (e) {
    const msg = e.message || 'Sign in failed';
    if (/otp not found|incorrect otp|expired/i.test(msg)) {
      if (/otp not found|expired/i.test(msg)) setOtpToken(null);
      toast(`${msg} — tap Send OTP again`, 'err');
    } else {
      toast(msg, 'err');
    }
  } finally {
    otpBusy = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Sign in';
    }
  }
}

function signOut() {
  state.token = null;
  localStorage.removeItem('safealert_token');
  setOtpToken(null);
  circle = [{ name: 'Sign in', rel: 'Tap profile', status: 'unknown', icon: '👤', last: 'Add trusted contacts' }];
  updateProfileUI();
  buildCircle();
  document.getElementById('s-circle').textContent = '0';
  closeSheets();
  updateSignInBanner();
  toast('Signed out');
}

function circlePhoneStore() {
  try {
    return JSON.parse(localStorage.getItem('safealert_circle_phones') || '{}');
  } catch {
    return {};
  }
}

async function saveCircleMember() {
  if (!(await ensureAuth())) return toast('Sign in first', 'err');
  const name = document.getElementById('c-name')?.value?.trim();
  const phone = document.getElementById('c-phone')?.value?.trim();
  const relation = document.getElementById('c-rel')?.value?.trim();
  if (!name || !phone || !relation) return toast('Name, phone, and relation required', 'err');
  const store = circlePhoneStore();
  store[name] = phone;
  localStorage.setItem('safealert_circle_phones', JSON.stringify(store));
  const payload = circle
    .filter((m) => m.name !== 'Sign in')
    .map((m) => ({
      name: m.name,
      phone: store[m.name] || m.phone,
      relation: m.relation || m.rel,
    }))
    .filter((m) => m.phone);
  if (!payload.some((m) => m.name === name)) payload.push({ name, phone, relation });
  try {
    await api('/user/circle', {
      method: 'PUT',
      body: JSON.stringify({ circle: payload.slice(0, 5) }),
    });
    const { circle: c } = await api('/user/circle');
    circle = (c || []).map((m) => ({
      name: m.name,
      rel: m.relation,
      relation: m.relation,
      status: 'safe',
      icon: '🏠',
      last: 'Circle member',
    }));
    document.getElementById('c-name').value = '';
    document.getElementById('c-phone').value = '';
    document.getElementById('c-rel').value = '';
    buildCircle();
    document.getElementById('s-circle').textContent = circle.length;
    window.SafeAlertCitizenSOS?.cacheCircle?.(circle);
    toast('Circle member saved', 'ok');
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function pingLocation() {
  const helpNearby = !!state.preferences?.help_nearby_enabled;
  if (!state.token || (!panicOn && !journeyOn && !helpNearby)) return;
  const { lat, lng } = effectiveCoords();
  try {
    await api('/user/location', {
      method: 'PUT',
      body: JSON.stringify({
        lat,
        lng,
        accuracy: 25,
        journey_active: journeyOn,
        panic_active: panicOn,
      }),
    });
  } catch (e) {
    if (e.status === 403 && helpNearby) {
      toast('Turn on Help nearby in profile, or start journey/panic to share location', 'err');
    } else if (e.status === 429) {
      /* throttled — expected */
    } else if (e.status !== 400) {
      console.warn('[location]', e.message);
    }
  }
}

function startLocationPing() {
  clearInterval(locationPingIv);
  pingLocation();
  const ms = panicOn ? 60000 : ds().journeyLocationPingMs();
  locationPingIv = setInterval(pingLocation, ms);
}

function stopLocationPing() {
  if (panicOn || journeyOn) return;
  if (state.preferences?.help_nearby_enabled) {
    syncHelpNearbyPing();
    return;
  }
  clearInterval(locationPingIv);
  locationPingIv = null;
  if (state.token) {
    api('/user/location', { method: 'DELETE' }).catch(() => {});
  }
}

// ── NAVIGATION ────────────────────────────────────────────────────────────────
async function go(id) {
  currentScreen = id;
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach((b) => {
    b.classList.remove('active');
    b.setAttribute('aria-selected', 'false');
  });
  const screenEl = document.getElementById('screen-' + id);
  screenEl?.classList.add('active');
  if (screenEl && screenEl.classList.contains('screen')) screenEl.scrollTop = 0;
  const navBtn = document.getElementById('nb-' + id);
  navBtn?.classList.add('active');
  navBtn?.setAttribute('aria-selected', 'true');
  if (navigator.vibrate) {
    try {
      navigator.vibrate(8);
    } catch (_) {
      /* ignore */
    }
  }
  if (id === 'map') {
    await ensureMapLoaded();
    await loadMapZones().catch(() => {});
    if (map) setTimeout(() => map.invalidateSize(), 80);
  }
  if (id === 'insights') {
    if (typeof applyI18n === 'function') applyI18n();
    if (!insightsLoaded) {
      loadInsightsData().catch(() => {
        const loading = document.getElementById('insights-loading');
        if (loading) {
          loading.textContent = 'Could not load dashboard — pull to refresh or tap 🔄';
          loading.style.color = 'var(--red)';
        }
      });
    } else {
      buildInsights();
    }
  }
  if (id === 'routes' && !routesLoaded) {
    loadRoutesData()
      .then(() => {
        buildRoutes();
        filterRoutes();
      })
      .catch(() => {});
  }
  if (id === 'trust') {
    if (typeof applyI18n === 'function') applyI18n();
    if (typeof loadTrustScreen === 'function') loadTrustScreen();
  }
  if (id === 'circle') {
    const jobs = [];
    if (!groupsLoaded) jobs.push(loadGroupsData().then(buildGroups));
    if (!circle.length || state.token) jobs.push(loadCircleData().then(buildCircle));
    jobs.push(loadResources());
    if (typeof window.SafeAlertEstate?.loadEstatePanel === 'function') {
      jobs.push(window.SafeAlertEstate.loadEstatePanel());
    }
    Promise.all(jobs).catch(() => {});
  }
  if (id === 'report' && !settingsLoaded) loadSettingsIfNeeded().then(buildTypeGrid).catch(() => {});
}

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
  l.textContent = demo ? 'Approximate location' : 'GPS detected';
  c.textContent = `${lat.toFixed(5)}°N, ${lng.toFixed(5)}°E`;
}

// ── PANIC ─────────────────────────────────────────────────────────────────────
function holdStart() {
  holdProg = 0;
  const arc = document.getElementById('panic-arc');
  const hint = document.getElementById('panic-hint');
  const btn = document.getElementById('panic-btn');
  btn.classList.add('holding');
  holdTmr = setInterval(() => {
    holdProg += 100 / 60;
    const circ = 2 * Math.PI * 55;
    const fill = (holdProg / 100) * circ;
    arc.setAttribute('stroke-dasharray', `${fill} ${circ}`);
    const s = Math.max(0, Math.ceil(3 - (holdProg / 100) * 3));
    hint.textContent = holdProg >= 100 ? 'Activating…' : `Hold ${s}s more to activate`;
    if (holdProg >= 100) {
      clearInterval(holdTmr);
      doPanic();
    }
  }, 50);
}

function holdStop() {
  clearInterval(holdTmr);
  document.getElementById('panic-arc').setAttribute('stroke-dasharray', '0 345.4');
  document.getElementById('panic-hint').textContent = 'Hold 3 seconds to activate';
  document.getElementById('panic-btn').classList.remove('holding');
  holdProg = 0;
}

async function doPanic() {
  holdStop();
  if (!(await ensureAuth())) return;
  window.SafeAlertCitizenSOS?.warnIfCircleEmpty?.();
  try {
    const { lat, lng } = effectiveCoords();
    const panicRes = await api('/panic/activate', {
      method: 'POST',
      body: JSON.stringify({ lat, lng }),
    });
    const pid = panicRes.short_id || panicRes.panic_id?.slice(-6)?.toUpperCase() || '';
    toast(
      panicRes.notifications_async
        ? `Panic #${pid} — your circle & nearby helpers are being notified`
        : `Panic #${pid} activated`,
      'ok'
    );
    if (panicRes.panic_id) {
      window.SafeAlertUX = window.SafeAlertUX || {};
      window.SafeAlertUX.activePanicId = panicRes.panic_id;
      window.SafeAlertUX.activePanicShortId = pid;
      const hint = document.getElementById('panic-hint');
      if (hint) hint.textContent = `Alert #${pid} — tap WhatsApp SOS if no one responds in 2 min`;
      const mapsBtn = document.getElementById('pov-open-maps');
      if (mapsBtn && uLat != null) {
        mapsBtn.style.display = 'flex';
        mapsBtn.onclick = () => openMapsForPanic(uLat, uLng, `Panic #${pid}`);
      }
      if (typeof refreshPovResponders === 'function') refreshPovResponders();
    }
  } catch (e) {
    if (e.status === 409) {
      panicOn = true;
      document.getElementById('pov')?.classList.add('show');
      toast(e.message, 'err');
      window.SafeAlertCitizenSOS?.renderPovCircleActions?.();
      return;
    }
    window.SafeAlertCitizenSOS?.activateLocalFallback?.(e.message);
    panicOn = true;
    panicSecs = 0;
    startLocationPing();
    panicTmr = setInterval(() => {
      panicSecs++;
      document.getElementById('pov-timer').textContent = fmt(panicSecs);
      if (uLat && uLng)
        document.getElementById('pov-coords').textContent = `${uLat.toFixed(5)}°N, ${uLng.toFixed(5)}°E`;
    }, 1000);
    return;
  }
  panicOn = true;
  panicSecs = 0;
  navigator.vibrate?.([200, 100, 200, 100, 400]);
  startLocationPing();
  document.getElementById('pov').classList.add('show');
  document.getElementById('pov-members').innerHTML = circle
    .slice(0, 5)
    .filter((m) => m.name !== 'Sign in')
    .map(
      (m) => `
    <div class="pov-member">
      <div class="pov-member-dot"></div>
      <span style="font-size:12px;color:rgba(255,255,255,0.85);flex:1">${escapeHtml(m.name)} — ${escapeHtml(m.rel || m.relation || '')}</span>
      <span style="font-size:10px;color:var(--green);font-weight:700">Alerting ✓</span>
    </div>`
    )
    .join('');
  window.SafeAlertCitizenSOS?.renderPovCircleActions?.();
  panicTmr = setInterval(() => {
    panicSecs++;
    document.getElementById('pov-timer').textContent = fmt(panicSecs);
    if (uLat && uLng)
      document.getElementById('pov-coords').textContent = `${uLat.toFixed(5)}°N, ${uLng.toFixed(5)}°E`;
  }, 1000);
  setTimeout(() => window.SafeAlertCitizenSOS?.sharePanicWhatsApp?.(), 1500);
}

async function deactivatePanic() {
  panicOn = false;
  clearInterval(panicTmr);
  clearInterval(window._povResponderIv);
  window._povResponderIv = null;
  if (window.SafeAlertUX) {
    window.SafeAlertUX.activePanicId = null;
    window.SafeAlertUX.activePanicShortId = null;
  }
  if (!journeyOn) stopLocationPing();
  document.getElementById('pov').classList.remove('show');
  const mapsBtn = document.getElementById('pov-open-maps');
  if (mapsBtn) mapsBtn.style.display = 'none';
  if (state.token) {
    try {
      await api('/panic/deactivate', { method: 'POST', body: '{}' });
    } catch (_) {
      /* ignore */
    }
  }
  toast('✓ Panic deactivated. Stay safe.');
}

async function broadcastPanicNearby() {
  if (!panicOn) return toast('Activate panic first', 'err');
  if (!(await ensureAuth())) return;
  try {
    const d = await api('/panic/broadcast', {
      method: 'POST',
      body: JSON.stringify(effectiveCoords()),
    });
    toast(d.message || '📢 Broadcast queued for nearby helpers', 'ok');
  } catch (e) {
    toast(e.message, 'err');
  }
}

// ── JOURNEY ───────────────────────────────────────────────────────────────────
async function startJourney() {
  if (!(await ensureAuth())) {
    toast('Sign in required for journey');
    return;
  }
  try {
    await api('/journey/start', { method: 'POST', body: '{}' });
    journeyOn = true;
    jSecs = 0;
    document.getElementById('j-start-ui').style.display = 'none';
    document.getElementById('j-live-ui').style.display = 'block';
    jTmr = setInterval(() => {
      jSecs++;
      document.getElementById('j-timer').textContent = fmt(jSecs);
    }, 1000);
    startLocationPing();
    toast('🚗 Journey started — your circle is watching', 'ok');
  } catch (e) {
    toast(e.message);
  }
}

function resetJourneyUi() {
  journeyOn = false;
  journeyRating = 0;
  clearInterval(jTmr);
  if (!panicOn) stopLocationPing();
  document.getElementById('j-start-ui').style.display = 'block';
  document.getElementById('j-live-ui').style.display = 'none';
  document.querySelectorAll('.j-rate').forEach((b) => {
    b.classList.remove('btn-green');
    b.classList.add('btn-outline');
  });
}

function openJourneyEndSheet() {
  if (!journeyOn) return;
  if (!state.token) {
    resetJourneyUi();
    toast('✓ Journey ended.');
    return;
  }
  journeyRating = 0;
  document.querySelectorAll('.j-rate').forEach((b) => {
    b.classList.remove('btn-green');
    b.classList.add('btn-outline');
  });
  markSheetOpened();
  document.getElementById('sheet-bg')?.classList.add('show');
  document.getElementById('journey-end-sheet')?.classList.add('show');
  setTimeout(() => document.getElementById('j-from')?.focus(), 300);
}

function pickJourneyRating(n) {
  journeyRating = n;
  document.querySelectorAll('.j-rate').forEach((b) => {
    const r = parseInt(b.dataset.rating, 10);
    const on = r === n;
    b.classList.toggle('btn-green', on);
    b.classList.toggle('btn-outline', !on);
  });
}

async function submitJourneyEnd() {
  const from = document.getElementById('j-from')?.value?.trim();
  const to = document.getElementById('j-to')?.value?.trim();
  const via = document.getElementById('j-via')?.value?.trim() || '';
  if (!from || !to) return toast('Enter From and To cities', 'err');
  if (!journeyRating) return toast('Pick a safety score 1–5', 'err');
  try {
    const res = await api('/journey/end', {
      method: 'POST',
      body: JSON.stringify({ from, to, via, safety_rating: journeyRating }),
    });
    closeSheets();
    resetJourneyUi();
    const routeMsg = res.route_feedback?.route
      ? ` Route score: ${res.route_feedback.route.safety_score}/100.`
      : '';
    toast(`✓ Thanks! Journey ended.${routeMsg}`, 'ok');
    routesLoaded = false;
    loadRoutesData().catch(() => {});
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function endJourneySkipRating() {
  if (state.token) {
    try {
      await api('/journey/end', { method: 'POST', body: '{}' });
    } catch (_) {
      /* ignore */
    }
  }
  closeSheets();
  resetJourneyUi();
  toast('✓ Journey ended.');
}

async function endJourney() {
  if (journeyOn && state.token) {
    openJourneyEndSheet();
    return;
  }
  resetJourneyUi();
  toast('✓ Journey ended.');
}

// ── REPORT ────────────────────────────────────────────────────────────────────
function buildTypeGrid() {
  document.getElementById('type-grid').innerHTML = types
    .map(
      (t) => `
    <div class="t-chip" id="tc-${t.id}" onclick="pickType('${t.id}')">
      <div class="t-icon">${ico(t.icon)}</div>
      <span>${t.label}</span>
    </div>`
    )
    .join('');
}

function pickType(id) {
  selectedType = id;
  document.querySelectorAll('.t-chip').forEach((c) => c.classList.remove('sel'));
  document.getElementById('tc-' + id)?.classList.add('sel');
  document.getElementById('sn1').className = 'step-num done';
  document.getElementById('sn1').textContent = '✓';
  document.getElementById('sn2').className = 'step-num curr';
  document.getElementById('sub-btn').disabled = false;
}

async function submitReport() {
  if (!selectedType) return;
  const { lat, lng } = effectiveCoords();
  const desc = document.getElementById('rdesc').value;
  try {
    await api('/zones', {
      method: 'POST',
      body: JSON.stringify({
        lat,
        lng,
        type: selectedType,
        description: desc,
        device_id: state.deviceId,
      }),
    });
    await refreshZones();
    document.getElementById('sub-btn').disabled = true;
    document.getElementById('sn1').className = 'step-num wait';
    document.getElementById('sn1').textContent = '1';
    document.getElementById('sn2').className = 'step-num wait';
    document.querySelectorAll('.t-chip').forEach((c) => c.classList.remove('sel'));
    document.getElementById('rdesc').value = '';
    selectedType = null;
    go('map');
    if (map) map.flyTo([lat, lng], 12, { animate: true, duration: 1.2 });
    toast('🚨 Report submitted! Community alerted.');
  } catch (e) {
    toast(e.message);
  }
}

function buildHomeList() {
  const el = document.getElementById('home-list');
  if (!el) return;
  if (!zones.length) {
    el.innerHTML =
      '<p style="font-size:12px;color:var(--text3);padding:12px;text-align:center">No active alerts in your area — map is quiet. You can still report or check routes.</p>';
    return;
  }
  el.innerHTML = zones
    .slice(0, 3)
    .map((z) => {
      const c = SEV_C[z.sev];
      const ti = types.find((t) => t.id === z.type) || { icon: '⚠️' };
      const bc = z.sev === 'critical' ? 'badge-red' : z.sev === 'high' ? 'badge-amber' : 'badge-gray';
      return `<div class="alert-row" onclick="openZoneSheet('${z.id}')" style="cursor:pointer">
      <div class="alert-icon-box" style="background:${c}15;border:1px solid ${c}33">${ico(ti.icon)}</div>
      <div style="flex:1;min-width:0">
        <div class="alert-title">${escapeHtml(z.label)}</div>
        <div class="alert-meta">${escapeHtml(z.state)} · ${escapeHtml(z.time)} · ${z.reports} reports</div>
      </div>
      <span class="badge ${bc}">${z.sev.toUpperCase()}</span>
    </div>`;
    })
    .join('');
  document.getElementById('s-hot').textContent = zones.filter((z) => z.sev === 'critical').length;
}

function buildRoutes() {
  filterRoutes();
}

function buildCircle() {
  document.getElementById('circle-list').innerHTML = circle
    .map((m) => {
      const sc = m.status === 'safe' ? 'green' : m.status === 'traveling' ? 'amber' : 'gray';
      const ab =
        m.status === 'safe'
          ? 'rgba(18,183,106,0.1)'
          : m.status === 'traveling'
            ? 'rgba(247,144,9,0.1)'
            : 'rgba(255,255,255,0.05)';
      const bd =
        m.status === 'safe'
          ? 'rgba(18,183,106,0.25)'
          : m.status === 'traveling'
            ? 'rgba(247,144,9,0.3)'
            : 'var(--border)';
      const isSignIn = m.name === 'Sign in';
      return `<div class="member-card" ${isSignIn ? 'role="button" tabindex="0" style="cursor:pointer" onclick="openProfile()"' : ''}>
      <div class="member-av" style="background:${ab};border:1px solid ${bd}">${ico(m.icon)}</div>
      <div style="flex:1;min-width:0">
        <div class="member-name">${escapeHtml(m.name)}</div>
        <div class="member-sub">${escapeHtml(m.rel)} · ${escapeHtml(isSignIn ? 'Opens account login' : m.last)}</div>
      </div>
      <span class="badge badge-${sc}">${isSignIn ? 'LOGIN' : m.status.toUpperCase()}</span>
    </div>`;
    })
    .join('');
  syncCircleSetupNudge();
}

async function joinGroup(id, name) {
  if (!(await ensureAuth())) {
    toast('Sign in to join groups', 'err');
    openProfile();
    return;
  }
  try {
    await api(`/groups/${id}/join`, { method: 'POST', body: '{}' });
    toast(`Joined ${name}`, 'ok');
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function loadResources() {
  const el = document.getElementById('resources-list');
  if (!el) return;
  try {
    let url = '/resources?limit=20';
    if (uLat != null && uLng != null) url = `/resources/nearby?lat=${uLat}&lng=${uLng}&radius_km=50`;
    const { resources } = await api(url);
    if (!resources?.length) {
      el.innerHTML = '<p style="font-size:12px;color:var(--text3)">No resources loaded yet.</p>';
      return;
    }
    el.innerHTML = resources
      .map(
        (r) => `<div class="group-row" style="cursor:default">
        <span style="font-size:20px">${r.type === 'hospital' ? '🏥' : r.type === 'legal' ? '⚖️' : r.type === 'safe_house' ? '🏠' : '📋'}</span>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:700">${escapeHtml(r.name)}</div>
          <div style="font-size:11px;color:var(--text2)">${escapeHtml(r.state || '')}${r.distance_km != null ? ` · ${r.distance_km} km` : ''}</div>
        </div>
        <a href="tel:${escapeHtml(r.phone)}" style="font-size:12px;color:var(--green);font-weight:700">Call</a>
      </div>`
      )
      .join('');
  } catch (_) {
    el.innerHTML = '<p style="font-size:12px;color:var(--text3)">Resources unavailable</p>';
  }
}

async function startCheckIn() {
  if (!state.token) return toast('Sign in for check-in', 'err');
  try {
    const due = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const { check_in } = await api('/check-in', {
      method: 'POST',
      body: JSON.stringify({ due_at: due, notify_circle: true }),
    });
    state.activeCheckIn = check_in;
    syncCheckInUI();
    toast('Check-in scheduled — confirm before deadline', 'ok');
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function confirmCheckIn() {
  if (!state.token || !state.activeCheckIn?.id) return;
  try {
    await api(`/check-in/${state.activeCheckIn.id}/confirm`, { method: 'POST', body: '{}' });
    state.activeCheckIn = null;
    syncCheckInUI();
    toast('Check-in confirmed — you are safe', 'ok');
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function loadActiveCheckIn() {
  if (!state.token) return;
  try {
    const { check_in } = await api('/check-in/active');
    state.activeCheckIn = check_in;
    syncCheckInUI();
  } catch (_) {
    /* ignore */
  }
}

function syncCheckInUI() {
  const idle = document.getElementById('checkin-idle');
  const active = document.getElementById('checkin-active');
  const due = document.getElementById('checkin-due');
  if (!idle || !active) return;
  if (state.activeCheckIn) {
    idle.style.display = 'none';
    active.style.display = 'block';
    if (due) {
      const t = new Date(state.activeCheckIn.due_at);
      due.textContent = `Due ${t.toLocaleString('en-NG', { hour: '2-digit', minute: '2-digit' })}`;
    }
  } else {
    idle.style.display = 'block';
    active.style.display = 'none';
  }
}

async function saveResponderProfile() {
  if (!state.token) return toast('Sign in first', 'err');
  const available = !!document.getElementById('pref-responder-available')?.checked;
  const skills = [...document.querySelectorAll('#responder-skills input[data-skill]:checked')].map(
    (el) => el.getAttribute('data-skill')
  );
  try {
    const d = await api('/user/responder-profile', {
      method: 'PUT',
      body: JSON.stringify({ skills, available }),
    });
    state.preferences.responder_skills = d.responder?.skills || skills;
    state.preferences.responder_available = d.responder?.available;
    toast('Responder profile saved', 'ok');
    syncNearbyPanicCard();
  } catch (e) {
    toast(e.message, 'err');
  }
}

function rescheduleRefreshTimers() {
  clearInterval(refreshIv);
  clearInterval(nearbyPanicIv);
  refreshIv = setInterval(() => {
    if (document.visibilityState === 'visible') refreshAll().catch(() => {});
  }, ds().refreshIntervalMs());
  const nearbyMs = ds().nearbyPanicPollMs();
  if (nearbyMs > 0) {
    nearbyPanicIv = setInterval(() => {
      if (
        state.token &&
        state.preferences?.help_nearby_enabled &&
        document.visibilityState === 'visible'
      ) {
        syncNearbyPanicCard().catch(() => {});
      }
    }, nearbyMs);
  }
}

async function syncNearbyPanicCard() {
  const card = document.getElementById('nearby-panic-card');
  const list = document.getElementById('nearby-panic-list');
  if (!card || !list) return;
  if (ds().isEnabled() && ds().pushLikelyWorks()) {
    card.style.display = state.preferences.help_nearby_enabled ? 'block' : 'none';
    if (state.preferences.help_nearby_enabled) {
      list.innerHTML =
        '<p style="font-size:11px;color:var(--text3)">Push alerts on — panics will notify you without polling.</p>';
    }
    return;
  }
  if (!state.token || !state.preferences.help_nearby_enabled || uLat == null) {
    card.style.display = 'none';
    return;
  }
  card.style.display = 'block';
  try {
    const radius = state.preferences.help_nearby_radius_km || 5;
    const { panics } = await api(`/panic/nearby?lat=${uLat}&lng=${uLng}&radius_km=${radius}`);
    if (!panics?.length) {
      list.innerHTML = 'No active panics nearby right now.';
      return;
    }
    list.innerHTML = panics
      .map((p) => {
        const sid = escapeHtml(p.short_id || p.id?.slice(-6) || '????');
        const dist = p.distance_km != null ? `${p.distance_km} km away` : '';
        const when = p.started_at ? timeAgo(p.started_at) : '';
        const responders =
          p.responder_count > 0
            ? `<span style="color:var(--green);font-size:10px">${p.responder_count} helper${p.responder_count > 1 ? 's' : ''} en route</span>`
            : '';
        const mapsBtn =
          p.lat != null && p.lng != null
            ? `<button class="btn btn-outline btn-sm" style="margin-top:6px;margin-right:6px" onclick="openMapsForPanic(${p.lat},${p.lng},'Panic #${sid}')">🗺 Maps</button>`
            : '';
        const btn = p.already_responding
          ? `<div style="margin-top:8px;font-size:11px;font-weight:700;color:var(--green)">✓ You're on the way</div>${mapsBtn}`
          : `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">
          <button class="btn btn-green btn-sm" onclick="respondToPanic('${escapeHtml(p.id)}','${sid}')">I'm on my way</button>
          ${mapsBtn}
          <button class="btn btn-outline btn-sm" style="color:var(--text3)" onclick="dismissPanicHelper('${escapeHtml(p.id)}')">Can't help</button>
        </div>`;
        return `<div class="panic-alert-card" data-panic-id="${escapeHtml(p.id)}" style="padding:12px;margin-bottom:8px;border-radius:12px;border:1px solid var(--red-border);background:var(--red-soft)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <div>
            <span style="font-size:10px;font-weight:800;letter-spacing:.08em;color:var(--red);background:rgba(240,62,62,0.2);padding:2px 8px;border-radius:6px">PANIC #${sid}</span>
            <div style="font-weight:700;font-size:13px;margin-top:6px">${escapeHtml(p.victim_label || 'Someone nearby')}</div>
            <div style="font-size:11px;color:var(--text2);margin-top:4px">${escapeHtml(p.state || '')}${dist ? ' · ' + dist : ''}${when ? ' · ' + when : ''}</div>
          </div>
        </div>
        ${responders}
        ${btn}
      </div>`;
      })
      .join('');
  } catch (e) {
    list.textContent = e.message;
  }
}

async function respondToPanic(id, shortId) {
  if (!state.token) return toast('Sign in first', 'err');
  try {
    const d = await api(`/panic/${id}/respond`, { method: 'POST', body: '{}' });
    const tag = shortId || d.short_id || '';
    toast(d.message || (d.push_sent ? `Alert #${tag}: they were notified` : `Marked en route for #${tag}`), 'ok');
    syncNearbyPanicCard();
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function reportFalseZone(id) {
  try {
    const d = await api(`/zones/${id}/report-false`, {
      method: 'POST',
      body: JSON.stringify({ device_id: state.deviceId, reason: 'Suspected false report' }),
    });
    toast(d.message || 'Report recorded', 'ok');
    await refreshAll();
  } catch (e) {
    toast(e.message, 'err');
  }
}

function buildGroups() {
  const el = document.getElementById('groups-list');
  if (!el) return;
  if (!groups.length) {
    el.innerHTML = `<p style="font-size:12px;color:var(--text2);line-height:1.5;padding:8px 0">${escapeHtml(window.groupsApiNote || 'No community groups yet — create one for your union, market, or estate.')}</p>`;
    return;
  }
  el.innerHTML = groups
    .map((g) => {
      const badge = g.verified
        ? '<span class="badge badge-green" style="font-size:9px;margin-left:6px">Verified</span>'
        : g.source === 'community'
          ? '<span class="badge badge-gray" style="font-size:9px;margin-left:6px">Community</span>'
          : '';
      const members =
        g.members === 1 ? '1 member' : `${g.members.toLocaleString()} members`;
      return `
    <div class="group-row" onclick='joinGroup(${JSON.stringify(g.id)}, ${JSON.stringify(g.name)})'>
      <span style="font-size:24px">${g.icon}</span>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:700;margin-bottom:2px">${escapeHtml(g.name)}${badge}</div>
        <div style="font-size:11px;color:var(--text2)">${members}</div>
      </div>
      ${g.alerts ? `<div style="background:var(--red);color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800">${g.alerts}</div>` : ''}
    </div>`;
    })
    .join('');
}

function fmt(s) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function toast(msg, kind) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('toast-ok', 'toast-err');
  if (kind === 'ok') el.classList.add('toast-ok');
  if (kind === 'err') el.classList.add('toast-err');
  el.classList.add('show');
  clearTimeout(toastTmr);
  toastTmr = setTimeout(() => el.classList.remove('show', 'toast-ok', 'toast-err'), 4000);
}

// Expose for inline handlers in HTML
window.go = go;
window.holdStart = holdStart;
window.holdStop = holdStop;
window.state = state;
window.api = api;
window.apiGetCached = apiGetCached;
window.loadData = loadData;
window.doPanic = doPanic;
window.deactivatePanic = deactivatePanic;
window.syncNearbyPanicCard = syncNearbyPanicCard;
window.respondToPanic = respondToPanic;
window.startJourney = startJourney;
window.endJourney = endJourney;
window.openJourneyEndSheet = openJourneyEndSheet;
window.pickJourneyRating = pickJourneyRating;
window.submitJourneyEnd = submitJourneyEnd;
window.endJourneySkipRating = endJourneySkipRating;
window.pickType = pickType;
window.submitReport = submitReport;
window.filt = filt;
window.togglePin = togglePin;
window.locateMe = locateMe;
window.flyTo = flyTo;
window.confirmZ = confirmZ;
window.clearZ = clearZ;
window.toast = toast;
window.refreshAll = refreshAll;
window.saveDataSaver = saveDataSaver;
window.ensureMapLoaded = ensureMapLoaded;
window.loadStatsOnly = loadStatsOnly;
window.buildInsights = buildInsights;
window.loadInsightsData = loadInsightsData;
window.loadMapZones = loadMapZones;
window.loadAllZonesData = loadAllZonesData;
window.normState = normState;
window.haversineKm = haversineKm;
window.zonesNearUser = zonesNearUser;
window.formatTypeLabel = formatTypeLabel;
window.insightsDrill = insightsDrill;
window.searchZones = searchZones;
window.filterRoutes = filterRoutes;
window.openZoneSheet = openZoneSheet;
window.closeSheets = closeSheets;
window.openProfile = openProfile;
window.onSheetBackdropClick = onSheetBackdropClick;
window.clearStuckOverlays = clearStuckOverlays;
window.markSheetOpened = markSheetOpened;
window.openCircleAdd = openCircleAdd;
window.requestOtp = requestOtp;
window.verifyOtp = verifyOtp;
window.signOut = signOut;
window.saveCircleMember = saveCircleMember;
window.joinGroup = joinGroup;
window.savePreferences = savePreferences;
window.broadcastPanicNearby = broadcastPanicNearby;
window.startCheckIn = startCheckIn;
window.confirmCheckIn = confirmCheckIn;
window.saveResponderProfile = saveResponderProfile;
window.respondToPanic = respondToPanic;
window.reportFalseZone = reportFalseZone;

function bindAuthButtons() {
  document.getElementById('btn-send-otp')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    requestOtp();
  });
  document.getElementById('btn-verify-otp')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    verifyOtp();
  });
  document.getElementById('p-otp')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') verifyOtp();
  });

  const profileBtn = document.getElementById('btn-profile');
  if (profileBtn && !profileBtn.dataset.bound) {
    profileBtn.dataset.bound = '1';
    let lastTap = 0;
    const open = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const now = Date.now();
      if (now - lastTap < 280) return;
      lastTap = now;
      openProfile();
    };
    profileBtn.addEventListener('click', open);
    profileBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') open(e);
    });
  }
}

function updateSignInBanner() {
  const btn = document.getElementById('btn-profile');
  if (!btn) return;
  if (state.token) {
    btn.title = 'Account';
    btn.style.borderColor = '';
  } else if (state.sandboxMode) {
    btn.title = 'Sign in (sandbox — OTP shown in app)';
    btn.style.borderColor = 'var(--green)';
  } else {
    btn.title = 'Sign in';
    btn.style.borderColor = 'var(--amber)';
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  clearStuckOverlays();
  bindAuthButtons();
  try {
    try {
      const health = await api('/health');
      state.sandboxMode = !!(health.sandbox_otp_in_api || health.at_sandbox);
      updateSignInBanner();
      const savedPhone = localStorage.getItem('safealert_phone');
      if (savedPhone) {
        const phoneEl = document.getElementById('p-phone');
        if (phoneEl && !phoneEl.value) phoneEl.value = savedPhone;
      }
      const hint = document.getElementById('auth-hint');
      if (hint && state.sandboxMode) {
        hint.textContent =
          'Sandbox: enter 080… → Send OTP → code fills in → Sign in. Same code works for 10 min.';
      }
      if (!state.token && state.sandboxMode && !sessionStorage.getItem('safealert_auth_prompted')) {
        sessionStorage.setItem('safealert_auth_prompted', '1');
        setTimeout(() => openProfile(), 600);
      }
    } catch {
      /* health optional */
    }
    if (state.token) {
      await loadPreferences();
    }
    ds().applyDom();
    syncDataSaverUI();
    await loadData({ full: !ds().isEnabled() });
    loadAllZonesData().catch(() => {});
    await loadActiveCheckIn();
    buildHomeList();
    if (routesLoaded) {
      buildRoutes();
      filterRoutes();
    }
    if (groupsLoaded) {
      buildCircle();
      buildGroups();
    }
    buildTypeGrid();
    if (typeof hydrateIcons === 'function') hydrateIcons();
    updateProfileUI();
    updateSignInBanner();
    startGPS();
    syncHelpNearbyPing();
    rescheduleRefreshTimers();
    window.addEventListener('safealert:panic-nearby', () => syncNearbyPanicCard().catch(() => {}));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        loadStatsOnly().catch(() => {});
        refreshAll().catch(() => {});
      }
    });
  } catch (e) {
    console.error(e);
    setConn(false);
    try {
      await loadData({ full: false });
      toast('Using offline/saved data — server unavailable', 'err');
    } catch {
      toast('Could not load API — try offline packs in Community tools', 'err');
    }
  }
});
