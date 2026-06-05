const { db } = require('../config/db');
const { isMemoryDb } = require('../config/firebase');
const appConfig = require('../config/appConfig');
const { distanceKm } = require('../utils/geo');
const { getNeighborPrefixes } = require('../utils/geohash');

const USER_BATCH_SIZE = 100;

async function loadUsersBatch(userIds) {
  const map = new Map();
  const uniq = [...new Set(userIds)];
  if (!uniq.length) return map;

  const database = db();
  const chunks = [];
  for (let i = 0; i < uniq.length; i += USER_BATCH_SIZE) {
    chunks.push(uniq.slice(i, i + USER_BATCH_SIZE));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      const refs = chunk.map((id) => database.collection('users').doc(id));
      const snaps = await database.getAll(...refs);
      for (const snap of snaps) {
        if (snap.exists) map.set(snap.id, { id: snap.id, ...snap.data() });
      }
    })
  );

  return map;
}

async function queryLocationsByPrefixes(prefixes, nowIso) {
  const candidates = new Map();
  const cellLimit = appConfig.geohashCellLimit;

  const snaps = await Promise.all(
    prefixes.map((prefix) =>
      db()
        .collection('locations')
        .where('geohash_prefix', '==', prefix)
        .where('expires_at', '>', nowIso)
        .limit(cellLimit)
        .get()
    )
  );

  for (const snap of snaps) {
    for (const doc of snap.docs) {
      candidates.set(doc.id, { id: doc.id, ...doc.data() });
    }
  }

  return candidates;
}

async function queryAllActiveLocations(nowIso) {
  const snap = await db().collection('locations').get();
  const candidates = new Map();
  for (const doc of snap.docs) {
    const loc = doc.data();
    if (!loc.expires_at || loc.expires_at <= nowIso) continue;
    candidates.set(doc.id, { id: doc.id, ...loc });
  }
  return candidates;
}

function filterNearby(lat, lng, radiusKm, candidates, { excludeUserId } = {}) {
  const users = [];

  for (const [userId, loc] of candidates) {
    if (loc.lat == null || loc.lng == null) continue;
    if (excludeUserId && userId === excludeUserId) continue;
    if (distanceKm(lat, lng, loc.lat, loc.lng) > radiusKm) continue;

    const isHelper =
      loc.help_nearby_enabled || loc.journey_active || loc.panic_active;
    if (!isHelper) continue;

    users.push({ loc, userId });
  }

  return users;
}

function passesFcmGate(loc, user, requireFcm) {
  if (user?.notifications_enabled === false) return false;
  if (loc.notifications_enabled === false) return false;

  const token = user?.fcm_token || loc.fcm_token;
  if (requireFcm && !token) return false;

  if (!user) {
    return !!(loc.help_nearby_enabled || loc.panic_active || loc.journey_active);
  }

  if (!user.help_nearby_enabled && !loc.panic_active && !loc.journey_active) {
    return false;
  }

  return true;
}

async function getNearbyUsers(lat, lng, radiusKm, options = {}) {
  const { excludeUserId, requireFcm = true } = options;
  const nowIso = new Date().toISOString();
  const prefixes = getNeighborPrefixes(lat, lng);

  let candidates = await queryLocationsByPrefixes(prefixes, nowIso);

  if (candidates.size === 0 && isMemoryDb()) {
    candidates = await queryAllActiveLocations(nowIso);
  }

  const nearby = filterNearby(lat, lng, radiusKm, candidates, { excludeUserId });
  const userIds = nearby.map(({ userId }) => userId);
  const usersById = await loadUsersBatch(userIds);
  const result = [];

  for (const { userId, loc } of nearby) {
    const user = usersById.get(userId) || null;
    if (!passesFcmGate(loc, user, requireFcm)) continue;

    const fcmToken = user?.fcm_token || loc.fcm_token || null;

    result.push({
      ...(user || { id: userId }),
      id: userId,
      fcm_token: fcmToken,
      lat: loc.lat,
      lng: loc.lng,
      distance_km: distanceKm(lat, lng, loc.lat, loc.lng),
    });
  }

  return result;
}

module.exports = { getNearbyUsers, loadUsersBatch };
