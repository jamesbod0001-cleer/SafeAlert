/**
 * Static zone/stats fallback when Firestore quota is exceeded or unavailable.
 * Regenerate: npm run build:zones-fallback
 */
const fs = require('fs');
const path = require('path');
const appConfig = require('../config/appConfig');

const DATA_DIR = path.join(__dirname, '../../public/data');
const ZONES_FILE = path.join(DATA_DIR, 'zones-fallback.json');
const STATS_FILE = path.join(DATA_DIR, 'stats-fallback.json');

let zonesCache = null;
let statsCache = null;
let mtime = 0;

function isQuotaError(err) {
  const code = err?.code;
  const msg = String(err?.message || '');
  return code === 8 || code === 'resource-exhausted' || /quota exceeded/i.test(msg);
}

function loadFromDisk() {
  try {
    const stat = fs.statSync(ZONES_FILE);
    if (stat.mtimeMs === mtime && zonesCache) return;
    mtime = stat.mtimeMs;
    zonesCache = JSON.parse(fs.readFileSync(ZONES_FILE, 'utf8'));
    if (fs.existsSync(STATS_FILE)) {
      statsCache = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
    }
  } catch {
    zonesCache = { zones: [], generated_at: null };
    statsCache = null;
  }
}

function hasFallback() {
  loadFromDisk();
  return Array.isArray(zonesCache?.zones) && zonesCache.zones.length > 0;
}

function getZones({ lat, lng, radiusKm, severity, limit = 200 } = {}) {
  loadFromDisk();
  let zones = (zonesCache?.zones || []).filter((z) => z.active !== false);
  if (appConfig.blockSimulatedData) {
    const blocked = new Set(['safealert_starter', 'review_fixture', 'daily_starter']);
    zones = zones.filter((z) => !blocked.has(z.source) && !String(z.id || '').startsWith('starter_'));
  }
  if (severity) zones = zones.filter((z) => z.severity === severity);
  if (lat !== undefined && lng !== undefined && radiusKm) {
    const { distanceKm } = require('../utils/geo');
    zones = zones.filter((z) => distanceKm(lat, lng, z.lat, z.lng) <= radiusKm);
  }
  const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  zones.sort((a, b) => {
    const d = (sevOrder[a.severity] || 3) - (sevOrder[b.severity] || 3);
    return d !== 0 ? d : new Date(b.created_at) - new Date(a.created_at);
  });
  return zones.slice(0, limit);
}

function getStats(incidentTypes = []) {
  loadFromDisk();
  if (statsCache?.stats) {
    return { ...statsCache.stats, _fallback: true, _generated_at: statsCache.generated_at };
  }
  const zones = getZones({ limit: 10000 });
  const by_state = {};
  const by_source = {};
  const by_type = {};
  for (const z of zones) {
    const st = (z.state || 'Unknown').trim().replace(/\s+state$/i, '') || 'Unknown';
    by_state[st] = (by_state[st] || 0) + 1;
    const src = z.source || 'community';
    by_source[src] = (by_source[src] || 0) + 1;
    by_type[z.type] = (by_type[z.type] || 0) + 1;
  }
  const types = incidentTypes.length ? incidentTypes : Object.keys(by_type);
  return {
    total_active_zones: zones.length,
    critical_zones: zones.filter((z) => z.severity === 'critical').length,
    high_zones: zones.filter((z) => z.severity === 'high').length,
    medium_zones: zones.filter((z) => z.severity === 'medium').length,
    low_zones: zones.filter((z) => z.severity === 'low').length,
    total_reports: zones.reduce((s, z) => s + (z.reports || 0), 0),
    active_panics: 0,
    live_count: zones.filter((z) => z.severity === 'critical').length,
    verified_zones: zones.filter((z) => z.verified).length,
    by_type: types.reduce((acc, t) => {
      acc[t] = by_type[t] || 0;
      return acc;
    }, {}),
    by_state,
    top_states: Object.entries(by_state)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count })),
    by_source,
    last_updated: zonesCache?.generated_at || new Date().toISOString(),
    _fallback: true,
  };
}

function getMeta() {
  loadFromDisk();
  return {
    source: 'static_fallback',
    zone_count: zonesCache?.zones?.length || 0,
    generated_at: zonesCache?.generated_at,
    dataset: zonesCache?.dataset || 'hdx_ucdp',
  };
}

module.exports = {
  isQuotaError,
  hasFallback,
  getZones,
  getStats,
  getMeta,
  ZONES_FILE,
};
