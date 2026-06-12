// src/services/zoneService.js
const { db } = require('../config/db');
const { hashAnonymous } = require('../utils/crypto');
const { guessState, distanceKm } = require('../utils/geo');
const { randomUUID: uuidv4 } = require('crypto');
const logger = require('../utils/logger');
const appConfig = require('../config/appConfig');
const statsCacheService = require('./statsCacheService');

const SEVERITY_THRESHOLDS = appConfig.severityThresholds;
const BLOCKED = new Set(['safealert_starter', 'review_fixture', 'daily_starter']);

function calcSeverity(votesDanger) {
  if (votesDanger >= SEVERITY_THRESHOLDS.critical) return 'critical';
  if (votesDanger >= SEVERITY_THRESHOLDS.high) return 'high';
  if (votesDanger >= SEVERITY_THRESHOLDS.medium) return 'medium';
  return 'low';
}

function normState(s) {
  return String(s || '')
    .trim()
    .replace(/\s+state$/i, '') || 'Unknown';
}

function isBlocked(z) {
  return appConfig.blockSimulatedData && (BLOCKED.has(z.source) || String(z.id || '').startsWith('starter_'));
}

function mergeZones(map, list) {
  for (const z of list) {
    if (!z?.id || isBlocked(z)) continue;
    map.set(z.id, z);
  }
}

async function runQuery(query) {
  const snap = await query.get();
  return snap.docs.map((d) => d.data());
}

/**
 * Cost-efficient zone reads: state-scoped + priority severities, never full collection scan.
 */
async function getZones({ lat, lng, radiusKm, severity, limit = 100, state: stateFilter } = {}) {
  const fallbackData = require('./fallbackDataService');
  const cap = Math.min(Math.max(parseInt(limit, 10) || 100, 1), appConfig.zonesMaxPerQuery || 300);

  try {
    const database = db();
    const zonesMap = new Map();
    const priorityLimit = appConfig.zonesPriorityLimit || 40;
    const stateLimit = appConfig.zonesStateQueryLimit || 250;

    const severities =
      severity ? [severity] : ['critical', 'high'];

    for (const sev of severities) {
      const rows = await runQuery(
        database
          .collection('zones')
          .where('active', '==', true)
          .where('severity', '==', sev)
          .orderBy('updated_at', 'desc')
          .limit(priorityLimit)
      );
      mergeZones(zonesMap, rows);
    }

    let stateName = stateFilter ? normState(stateFilter) : null;
    if (!stateName && lat !== undefined && lng !== undefined && Number.isFinite(lat) && Number.isFinite(lng)) {
      stateName = normState(guessState(lat, lng));
    }

    if (stateName && stateName !== 'Nigeria') {
      const rows = await runQuery(
        database
          .collection('zones')
          .where('active', '==', true)
          .where('state', '==', stateName)
          .orderBy('updated_at', 'desc')
          .limit(stateLimit)
      );
      mergeZones(zonesMap, rows);
    } else if (!stateName && !severity) {
      const rows = await runQuery(
        database.collection('zones').where('active', '==', true).orderBy('updated_at', 'desc').limit(cap)
      );
      mergeZones(zonesMap, rows);
    }

    let zones = [...zonesMap.values()];

    if (severity) {
      zones = zones.filter((z) => z.severity === severity);
    }

    if (lat !== undefined && lng !== undefined && radiusKm) {
      zones = zones.filter((z) => distanceKm(lat, lng, z.lat, z.lng) <= radiusKm);
    }

    const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    zones.sort((a, b) => {
      const d = (sevOrder[a.severity] || 3) - (sevOrder[b.severity] || 3);
      return d !== 0 ? d : new Date(b.updated_at) - new Date(a.created_at);
    });

    return zones.slice(0, cap);
  } catch (err) {
    if (fallbackData.isQuotaError(err) && fallbackData.hasFallback()) {
      return fallbackData.getZones({ lat, lng, radiusKm, severity, limit: cap });
    }
    throw err;
  }
}

async function countActiveZonesInState(state) {
  const stateName = normState(state);
  if (!stateName || stateName === 'Unknown' || stateName === 'Nigeria') return 0;
  try {
    const rows = await runQuery(
      db()
        .collection('zones')
        .where('active', '==', true)
        .where('state', '==', stateName)
        .limit(500)
    );
    return rows.filter((z) => !isBlocked(z)).length;
  } catch (err) {
    const fallbackData = require('./fallbackDataService');
    if (fallbackData.isQuotaError(err) && fallbackData.hasFallback()) {
      return fallbackData.getZones({ state: stateName, limit: 500 }).length;
    }
    throw err;
  }
}

async function getZoneById(id) {
  const fallbackData = require('./fallbackDataService');
  try {
    const snap = await db().collection('zones').doc(id).get();
    if (!snap.exists) return null;
    return snap.data();
  } catch (err) {
    if (fallbackData.isQuotaError(err) && fallbackData.hasFallback()) {
      return fallbackData.getZones({ limit: 10000 }).find((z) => z.id === id) || null;
    }
    throw err;
  }
}

async function createZone({ lat, lng, type, description, deviceId, photoUrls = [] }) {
  const id = uuidv4();
  const reporterHash = hashAnonymous(deviceId);
  const state = normState(guessState(lat, lng));
  const now = new Date().toISOString();
  const zone = {
    id,
    lat: parseFloat(lat),
    lng: parseFloat(lng),
    label: `${type.replace(/_/g, ' ')} — ${state}`,
    state,
    lga: '',
    type,
    description: description || '',
    severity: 'medium',
    reports: 1,
    votes_danger: 1,
    votes_cleared: 0,
    verified: false,
    active: true,
    source: 'community',
    photo_urls: photoUrls,
    reporter_hash: reporterHash,
    confirmed_by: [reporterHash],
    created_at: now,
    updated_at: now,
    expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
  };
  await db().collection('zones').doc(id).set(zone);
  await db().collection('reports').add({
    zone_id: id,
    type,
    description: description || '',
    lat: parseFloat(lat),
    lng: parseFloat(lng),
    reporter_hash: reporterHash,
    created_at: now,
  });
  statsCacheService.invalidateStatsCache();
  logger.info(`Zone created: ${id} [${type}]`);
  return zone;
}

async function confirmZone(id, deviceId) {
  const zone = await getZoneById(id);
  if (!zone || !zone.active) return { error: 'Zone not found or inactive' };
  const voterHash = hashAnonymous(deviceId || 'anonymous');
  const priorVoters = zone.danger_voters || [];
  if (priorVoters.includes(voterHash)) {
    return {
      zone,
      justVerified: false,
      becameCritical: false,
      already_voted: true,
    };
  }
  const danger_voters = [...priorVoters, voterHash];
  const newVotes = (zone.votes_danger || 0) + 1;
  const newSeverity = calcSeverity(newVotes);
  const wasVerified = zone.verified;
  const updates = {
    votes_danger: newVotes,
    danger_voters,
    reports: (zone.reports || 0) + 1,
    severity: newSeverity,
    verified: newVotes >= 3,
    updated_at: new Date().toISOString(),
  };
  await db().collection('zones').doc(id).update(updates);
  statsCacheService.invalidateStatsCache();
  return {
    zone: { ...zone, ...updates },
    justVerified: !wasVerified && newVotes >= 3,
    becameCritical: !wasVerified && newSeverity === 'critical',
  };
}

async function clearZone(id, deviceId) {
  const zone = await getZoneById(id);
  if (!zone || !zone.active) return { error: 'Zone not found or inactive' };
  const voterHash = hashAnonymous(deviceId || 'anonymous');
  const priorVoters = zone.clear_voters || [];
  if (priorVoters.includes(voterHash)) {
    return {
      zone,
      deactivated: false,
      clearRatio: Math.round(((zone.votes_cleared || 0) / Math.max(zone.votes_danger, 1)) * 100),
      already_voted: true,
    };
  }
  const clear_voters = [...priorVoters, voterHash];
  const newCleared = (zone.votes_cleared || 0) + 1;
  const clearRatio = newCleared / Math.max(zone.votes_danger, 1);
  const threshold = appConfig.zoneClearThreshold;
  const shouldDeactivate = clearRatio >= threshold && newCleared >= 3;
  const updates = {
    votes_cleared: newCleared,
    clear_voters,
    active: !shouldDeactivate,
    updated_at: new Date().toISOString(),
  };
  await db().collection('zones').doc(id).update(updates);
  statsCacheService.invalidateStatsCache();
  return {
    zone: { ...zone, ...updates },
    deactivated: shouldDeactivate,
    clearRatio: Math.round(clearRatio * 100),
  };
}

async function expireOldZones() {
  const database = db();
  const now = new Date();
  let expired = 0;
  const snap = await database
    .collection('zones')
    .where('active', '==', true)
    .orderBy('expires_at', 'asc')
    .limit(100)
    .get();

  for (const doc of snap.docs) {
    const zone = doc.data();
    if (zone.expires_at && new Date(zone.expires_at) < now) {
      await database.collection('zones').doc(zone.id).update({
        active: false,
        updated_at: now.toISOString(),
      });
      expired++;
    }
  }
  if (expired > 0) {
    statsCacheService.invalidateStatsCache();
    logger.info(`Cron: expired ${expired} zones`);
  }
  return expired;
}

async function recalculateSeverities() {
  const snap = await db()
    .collection('zones')
    .where('active', '==', true)
    .orderBy('updated_at', 'desc')
    .limit(200)
    .get();
  let updated = 0;
  for (const doc of snap.docs) {
    const zone = doc.data();
    const newSev = calcSeverity(zone.votes_danger || 0);
    if (newSev !== zone.severity) {
      await db().collection('zones').doc(zone.id).update({
        severity: newSev,
        updated_at: new Date().toISOString(),
      });
      updated++;
    }
  }
  if (updated > 0) statsCacheService.invalidateStatsCache();
  return updated;
}

async function reportFalseZone(id, deviceId, reason = '') {
  const zone = await getZoneById(id);
  if (!zone) return { error: 'Zone not found', status: 404 };

  const reporterHash = hashAnonymous(deviceId || 'anonymous');
  await db().collection('zone_flags').add({
    zone_id: id,
    reporter_hash: reporterHash,
    reason: (reason || '').slice(0, 300),
    created_at: new Date().toISOString(),
  });

  const flags = (zone.false_reports || 0) + 1;
  const updates = {
    false_reports: flags,
    updated_at: new Date().toISOString(),
  };
  if (flags >= 5) {
    updates.active = false;
    updates.deactivated_reason = 'community_false_reports';
  }
  await db().collection('zones').doc(id).update(updates);
  statsCacheService.invalidateStatsCache();

  return {
    success: true,
    false_reports: flags,
    deactivated: flags >= 5,
    message:
      flags >= 5 ? 'Zone hidden after multiple false reports' : 'Report recorded — thank you',
  };
}

module.exports = {
  getZones,
  countActiveZonesInState,
  getZoneById,
  createZone,
  confirmZone,
  clearZone,
  reportFalseZone,
  expireOldZones,
  recalculateSeverities,
  calcSeverity,
  normState,
};
