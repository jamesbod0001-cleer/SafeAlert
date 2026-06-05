const { db } = require('../config/db');
const appConfig = require('../config/appConfig');
const { encodeGeohash } = require('../utils/geohash');

function canShareLocation(user) {
  return !!(
    user.help_nearby_enabled ||
    user.journey_active ||
    user.panic_active
  );
}

function isNigeriaCoords(lat, lng) {
  return lat >= 4.0 && lat <= 14.0 && lng >= 2.7 && lng <= 15.0;
}

function isLocationThrottleOk(user) {
  if (!user.last_location_write_at) return true;
  const minMs = appConfig.locationMinIntervalSec * 1000;
  const last = new Date(user.last_location_write_at).getTime();
  return Date.now() - last >= minMs;
}

function buildLocationDoc(user, lat, lng, accuracy, overrides = {}) {
  const now = new Date();
  const ttlMin = appConfig.locationTtlMinutes;
  const expires = new Date(now.getTime() + ttlMin * 60 * 1000);
  const geo = encodeGeohash(lat, lng);

  return {
    lat,
    lng,
    accuracy: accuracy ?? null,
    user_id: user.id,
    journey_active: overrides.journey_active ?? !!user.journey_active,
    panic_active: overrides.panic_active ?? !!user.panic_active,
    help_nearby_enabled: !!user.help_nearby_enabled,
    fcm_token: user.fcm_token || null,
    notifications_enabled: user.notifications_enabled !== false,
    geohash: geo.geohash,
    geohash_prefix: geo.geohash_prefix,
    updated_at: now.toISOString(),
    expires_at: expires.toISOString(),
  };
}

async function syncLocationUserFields(userId, fields) {
  const ref = db().collection('locations').doc(userId);
  const snap = await ref.get();
  if (!snap.exists) return;
  await ref.set(fields, { merge: true });
}

async function upsertUserLocation(user, lat, lng, accuracy, overrides = {}) {
  if (!isNigeriaCoords(lat, lng)) {
    return {
      error: 'Location must be within Nigeria to use SafeAlert (enable GPS or move map pin)',
      status: 400,
    };
  }

  if (!canShareLocation({ ...user, ...overrides })) {
    return {
      error: 'Location sharing requires help-nearby opt-in, or an active journey/panic',
      status: 403,
    };
  }

  if (!isLocationThrottleOk(user)) {
    return { error: 'Location update too frequent', status: 429, retryAfterSec: appConfig.locationMinIntervalSec };
  }

  const location = buildLocationDoc(user, lat, lng, accuracy, overrides);
  const nowIso = new Date().toISOString();

  await db().collection('locations').doc(user.id).set(location);
  await db().collection('users').doc(user.id).update({
    last_location_write_at: nowIso,
    last_active: nowIso,
  });

  return { success: true, location };
}

module.exports = {
  canShareLocation,
  isNigeriaCoords,
  isLocationThrottleOk,
  buildLocationDoc,
  upsertUserLocation,
  syncLocationUserFields,
};
