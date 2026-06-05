/**
 * Free offline layer — bundled JSON when API is down or user has no data.
 * No Firestore reads; served from same origin as static files.
 */
(function () {
  const ZONES_URL = '/app/data/zones-fallback.json';
  const STATS_URL = '/app/data/stats-fallback.json';
  let zonesBundle = null;
  let statsBundle = null;

  function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function parseQuery(qs) {
    const out = {};
    const q = (qs || '').replace(/^\?/, '');
    if (!q) return out;
    q.split('&').forEach((pair) => {
      const [k, v] = pair.split('=');
      if (k) out[decodeURIComponent(k)] = decodeURIComponent(v || '');
    });
    return out;
  }

  async function loadZonesBundle() {
    if (zonesBundle) return zonesBundle;
    const res = await fetch(ZONES_URL, { cache: 'force-cache' });
    if (!res.ok) throw new Error('offline zones unavailable');
    zonesBundle = await res.json();
    return zonesBundle;
  }

  async function loadStatsBundle() {
    if (statsBundle) return statsBundle;
    const res = await fetch(STATS_URL, { cache: 'force-cache' });
    if (!res.ok) throw new Error('offline stats unavailable');
    statsBundle = await res.json();
    return statsBundle;
  }

  function filterZones(zones, query) {
    let list = (zones || []).filter((z) => z.active !== false);
    const lat = query.lat != null ? parseFloat(query.lat) : NaN;
    const lng = query.lng != null ? parseFloat(query.lng) : NaN;
    const radius = query.radius != null ? parseFloat(query.radius) : NaN;
    const limit = query.limit ? parseInt(query.limit, 10) : 200;
    const severity = query.severity;

    if (severity) list = list.filter((z) => z.severity === severity);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(radius)) {
      list = list.filter((z) => haversineKm(lat, lng, z.lat, z.lng) <= radius);
    }

    const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    list.sort((a, b) => {
      const d = (sevOrder[a.severity] || 3) - (sevOrder[b.severity] || 3);
      return d !== 0 ? d : new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
    });

    return list.slice(0, Number.isFinite(limit) ? limit : 200);
  }

  async function zonesFallback(apiPath) {
    const bundle = await loadZonesBundle();
    const query = parseQuery(apiPath.split('?')[1] || '');
    const zones = filterZones(bundle.zones, query);
    return {
      zones,
      data_note:
        'Offline map data (free bundle). Live community reports need internet.',
      _offline: true,
      _generated_at: bundle.generated_at,
    };
  }

  async function statsFallback() {
    const bundle = await loadStatsBundle();
    return {
      stats: { ...(bundle.stats || {}), _offline: true },
      data_note: 'Offline stats — connect for live panic & community counts.',
      _offline: true,
    };
  }

  async function tryFallback(apiPath) {
    const path = apiPath.split('?')[0];
    try {
      if (path === '/stats' || path === 'stats') return await statsFallback();
      if (path === '/zones' || path.startsWith('/zones') || path === 'zones') {
        return await zonesFallback(apiPath);
      }
    } catch (e) {
      console.warn('[offline-fallback]', e.message);
    }
    return null;
  }

  function staleBody(cacheKey) {
    try {
      const cached = localStorage.getItem(`safealert_body_${cacheKey}`);
      if (cached) return JSON.parse(cached);
    } catch (_) {
      /* ignore */
    }
    return null;
  }

  window.SafeAlertOffline = {
    tryFallback,
    staleBody,
    isOffline() {
      return typeof navigator !== 'undefined' && navigator.onLine === false;
    },
  };
})();
