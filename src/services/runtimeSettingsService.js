/**
 * Runtime toggles from Firestore app_settings/global (admin kill switch).
 * Env vars (appConfig) are boot defaults; Firestore overrides until restart.
 */
const { db } = require('../config/db');
const appConfig = require('../config/appConfig');

const TTL_MS = 15000;
let cache = { loadedAt: 0 };

function invalidate() {
  cache.loadedAt = 0;
}

async function load() {
  try {
    const snap = await db().collection('app_settings').doc('global').get();
    const data = snap.exists ? snap.data() : {};
    cache = {
      proximity_alerts_enabled:
        data.proximity_alerts_enabled ?? appConfig.proximityAlertsEnabled,
      push_notifications_enabled:
        data.push_notifications_enabled ?? appConfig.pushNotificationsEnabled,
      loadedAt: Date.now(),
    };
  } catch {
    cache = {
      proximity_alerts_enabled: appConfig.proximityAlertsEnabled,
      push_notifications_enabled: appConfig.pushNotificationsEnabled,
      loadedAt: Date.now(),
    };
  }
  return cache;
}

async function ensureLoaded() {
  if (!cache.loadedAt || Date.now() - cache.loadedAt > TTL_MS) {
    await load();
  }
  return cache;
}

async function isProximityAlertsEnabled() {
  const c = await ensureLoaded();
  return c.proximity_alerts_enabled !== false;
}

async function isPushNotificationsEnabled() {
  const c = await ensureLoaded();
  return c.push_notifications_enabled !== false;
}

async function getSnapshot() {
  const c = await ensureLoaded();
  return {
    proximity_alerts_enabled: c.proximity_alerts_enabled !== false,
    push_notifications_enabled: c.push_notifications_enabled !== false,
    env_defaults: {
      proximity_alerts_enabled: appConfig.proximityAlertsEnabled,
      push_notifications_enabled: appConfig.pushNotificationsEnabled,
    },
    cached_at: c.loadedAt ? new Date(c.loadedAt).toISOString() : null,
  };
}

module.exports = {
  invalidate,
  load,
  isProximityAlertsEnabled,
  isPushNotificationsEnabled,
  getSnapshot,
};
