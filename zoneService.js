// src/services/zoneService.js
const { db } = require('../config/db');
const { hashAnonymous } = require('../utils/crypto');
const { guessState } = require('../utils/geo');
const { randomUUID: uuidv4 } = require('crypto');
const logger = require('../utils/logger');

const SEVERITY_THRESHOLDS = { low:1, medium:3, high:5, critical:10 };

function calcSeverity(votesDanger) {
  if (votesDanger >= SEVERITY_THRESHOLDS.critical) return 'critical';
  if (votesDanger >= SEVERITY_THRESHOLDS.high)     return 'high';
  if (votesDanger >= SEVERITY_THRESHOLDS.medium)   return 'medium';
  return 'low';
}

async function getZones({ lat, lng, radiusKm, severity, limit=100 }={}) {
  const database = db();
  let query = database.collection('zones').where('active','==',true);
  if (severity) query = query.where('severity','==',severity);
  const snap = await query.get();
  let zones = snap.docs.map(d => d.data());
  if (lat!==undefined && lng!==undefined && radiusKm) {
    const { distanceKm } = require('../utils/geo');
    zones = zones.filter(z => distanceKm(lat,lng,z.lat,z.lng) <= radiusKm);
  }
  const sevOrder = { critical:0, high:1, medium:2, low:3 };
  zones.sort((a,b) => {
    const d = (sevOrder[a.severity]||3) - (sevOrder[b.severity]||3);
    return d !== 0 ? d : new Date(b.created_at) - new Date(a.created_at);
  });
  return zones.slice(0, limit);
}

async function getZoneById(id) {
  const snap = await db().collection('zones').doc(id).get();
  if (!snap.exists) return null;
  return snap.data();
}

async function createZone({ lat, lng, type, description, deviceId, photoUrls=[] }) {
  const id = uuidv4();
  const reporterHash = hashAnonymous(deviceId);
  const state = guessState(lat, lng);
  const now = new Date().toISOString();
  const zone = {
    id, lat:parseFloat(lat), lng:parseFloat(lng),
    label:`${type.replace(/_/g,' ')} — ${state}`,
    state, lga:'', type, description:description||'',
    severity:'medium', reports:1, votes_danger:1, votes_cleared:0,
    verified:false, active:true, photo_urls:photoUrls,
    reporter_hash:reporterHash, confirmed_by:[reporterHash],
    created_at:now, updated_at:now,
    expires_at:new Date(Date.now()+24*3600*1000).toISOString(),
  };
  await db().collection('zones').doc(id).set(zone);
  await db().collection('reports').add({ zone_id:id, type, description:description||'', lat:parseFloat(lat), lng:parseFloat(lng), reporter_hash:reporterHash, created_at:now });
  logger.info(`Zone created: ${id} [${type}]`);
  return zone;
}

async function confirmZone(id, deviceId) {
  const zone = await getZoneById(id);
  if (!zone || !zone.active) return { error:'Zone not found or inactive' };
  const newVotes = (zone.votes_danger||0)+1;
  const newSeverity = calcSeverity(newVotes);
  const wasVerified = zone.verified;
  const updates = { votes_danger:newVotes, reports:(zone.reports||0)+1, severity:newSeverity, verified:newVotes>=3, updated_at:new Date().toISOString() };
  await db().collection('zones').doc(id).update(updates);
  return { zone:{...zone,...updates}, justVerified:!wasVerified&&newVotes>=3, becameCritical:!wasVerified&&newSeverity==='critical' };
}

async function clearZone(id, deviceId) {
  const zone = await getZoneById(id);
  if (!zone || !zone.active) return { error:'Zone not found or inactive' };
  const newCleared = (zone.votes_cleared||0)+1;
  const clearRatio = newCleared / Math.max(zone.votes_danger,1);
  const threshold = parseFloat(process.env.ZONE_CLEAR_THRESHOLD||0.7);
  const shouldDeactivate = clearRatio>=threshold && newCleared>=3;
  const updates = { votes_cleared:newCleared, active:!shouldDeactivate, updated_at:new Date().toISOString() };
  await db().collection('zones').doc(id).update(updates);
  return { zone:{...zone,...updates}, deactivated:shouldDeactivate, clearRatio:Math.round(clearRatio*100) };
}

async function expireOldZones() {
  const now = new Date();
  const snap = await db().collection('zones').where('active','==',true).get();
  let expired=0;
  for (const doc of snap.docs) {
    const zone = doc.data();
    if (new Date(zone.expires_at) < now) {
      await db().collection('zones').doc(zone.id).update({ active:false, updated_at:now.toISOString() });
      expired++;
    }
  }
  if (expired>0) logger.info(`Cron: expired ${expired} zones`);
  return expired;
}

async function recalculateSeverities() {
  const snap = await db().collection('zones').where('active','==',true).get();
  let updated=0;
  for (const doc of snap.docs) {
    const zone = doc.data();
    const newSev = calcSeverity(zone.votes_danger||0);
    if (newSev!==zone.severity) {
      await db().collection('zones').doc(zone.id).update({ severity:newSev, updated_at:new Date().toISOString() });
      updated++;
    }
  }
  return updated;
}

module.exports = { getZones, getZoneById, createZone, confirmZone, clearZone, expireOldZones, recalculateSeverities, calcSeverity };
