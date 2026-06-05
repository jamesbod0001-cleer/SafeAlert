/**
 * Pre-aggregated stats — 1 Firestore read per /stats instead of scanning all zones.
 */
const { db } = require('../config/db');
const appConfig = require('../config/appConfig');
const configService = require('./configService');
const fallbackData = require('./fallbackDataService');
const logger = require('../utils/logger');

const CACHE_DOC = 'stats_cache';
const BLOCKED = new Set(['safealert_starter', 'review_fixture', 'daily_starter']);

let refreshTimer = null;
let refreshInFlight = null;

function normState(s) {
  return String(s || 'Unknown')
    .trim()
    .replace(/\s+state$/i, '') || 'Unknown';
}

function emptyStats() {
  return {
    total_active_zones: 0,
    critical_zones: 0,
    high_zones: 0,
    medium_zones: 0,
    low_zones: 0,
    total_reports: 0,
    active_panics: 0,
    live_count: 0,
    verified_zones: 0,
    by_type: {},
    by_state: {},
    top_states: [],
    by_source: {},
    last_updated: new Date().toISOString(),
  };
}

function aggregateZones(zones, incidentTypes) {
  const stats = emptyStats();
  const by_state = {};
  const by_source = {};
  const by_type = {};

  for (const z of zones) {
    if (!z.active) continue;
    if (appConfig.blockSimulatedData && (BLOCKED.has(z.source) || String(z.id || '').startsWith('starter_'))) {
      continue;
    }
    stats.total_active_zones++;
    stats.total_reports += z.reports || 0;
    if (z.verified) stats.verified_zones++;
    if (z.severity === 'critical') stats.critical_zones++;
    else if (z.severity === 'high') stats.high_zones++;
    else if (z.severity === 'medium') stats.medium_zones++;
    else stats.low_zones++;

    const st = normState(z.state);
    by_state[st] = (by_state[st] || 0) + 1;
    const src = z.source || 'community';
    by_source[src] = (by_source[src] || 0) + 1;
    by_type[z.type] = (by_type[z.type] || 0) + 1;
  }

  const types = incidentTypes?.length ? incidentTypes : Object.keys(by_type);
  stats.by_type = types.reduce((acc, t) => {
    acc[t] = by_type[t] || 0;
    return acc;
  }, {});
  stats.by_state = by_state;
  stats.by_source = by_source;
  stats.top_states = Object.entries(by_state)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));
  stats.live_count = stats.active_panics + stats.critical_zones;
  stats.last_updated = new Date().toISOString();
  return stats;
}

async function fetchActivePanicsCount() {
  try {
    const snap = await db().collection('panic_events').where('active', '==', true).limit(50).get();
    return snap.size;
  } catch {
    return 0;
  }
}

/** Paginated full scan — capped to control cost */
async function rebuildFromFirestore() {
  const database = db();
  const maxPages = appConfig.statsRebuildMaxPages || 8;
  const pageSize = appConfig.statsRebuildPageSize || 400;
  const zones = [];
  let lastDoc = null;

  for (let page = 0; page < maxPages; page++) {
    let q = database.collection('zones').where('active', '==', true).orderBy('updated_at', 'desc').limit(pageSize);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      zones.push(doc.data());
    }
    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < pageSize) break;
  }

  const incidentTypes = await configService.getIncidentTypes().catch(() => []);
  const stats = aggregateZones(zones, incidentTypes);
  stats.active_panics = await fetchActivePanicsCount();
  stats.live_count = stats.active_panics + stats.critical_zones;
  stats._zone_sample_size = zones.length;
  stats._rebuilt_at = new Date().toISOString();

  await db().collection('app_settings').doc(CACHE_DOC).set({
    stats,
    rebuilt_at: stats._rebuilt_at,
    zone_sample_size: zones.length,
  });

  logger.info(`[StatsCache] Rebuilt from ${zones.length} zones (max ${maxPages * pageSize} reads)`);
  return stats;
}

async function readCacheDoc() {
  const snap = await db().collection('app_settings').doc(CACHE_DOC).get();
  if (!snap.exists) return null;
  return snap.data();
}

function isStale(rebuiltAt) {
  if (!rebuiltAt) return true;
  const age = Date.now() - new Date(rebuiltAt).getTime();
  return age > (appConfig.statsCacheTtlMs || 900000);
}

async function getStats({ allowRebuild = true } = {}) {
  try {
    const doc = await readCacheDoc();
    const cached = doc?.stats;
    const rebuiltAt = doc?.rebuilt_at || cached?._rebuilt_at;

    if (cached && !isStale(rebuiltAt)) {
      return { stats: cached, from_cache: true };
    }

    if (allowRebuild && !refreshInFlight) {
      scheduleRefresh(0);
    }

    if (cached) {
      return { stats: cached, from_cache: true, stale: true };
    }

    const rebuilt = await rebuildFromFirestore();
    return { stats: rebuilt, from_cache: false };
  } catch (err) {
    if (fallbackData.isQuotaError(err) && fallbackData.hasFallback()) {
      const types = await configService.getIncidentTypes().catch(() => []);
      return {
        stats: fallbackData.getStats(types),
        from_cache: false,
        fallback: true,
      };
    }
    throw err;
  }
}

function scheduleRefresh(delayMs = 120000) {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    refreshStatsCache().catch((e) => logger.warn('[StatsCache] refresh failed:', e.message));
  }, delayMs);
}

async function refreshStatsCache() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = rebuildFromFirestore()
    .catch((err) => {
      if (fallbackData.isQuotaError(err)) {
        logger.warn('[StatsCache] quota — using static fallback for stats');
        return fallbackData.getStats();
      }
      throw err;
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

function invalidateStatsCache() {
  scheduleRefresh(30000);
}

module.exports = {
  getStats,
  refreshStatsCache,
  invalidateStatsCache,
  scheduleRefresh,
  aggregateZones,
  CACHE_DOC,
};
