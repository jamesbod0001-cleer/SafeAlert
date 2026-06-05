const { db } = require('../config/db');
const zoneService = require('./zoneService');
const checkInService = require('./checkInService');
const logger = require('../utils/logger');

async function purgeExpiredLocations() {
  const now = new Date().toISOString();
  const snap = await db().collection('locations').get();
  let removed = 0;

  for (const doc of snap.docs) {
    const loc = doc.data();
    if (loc.expires_at && loc.expires_at <= now) {
      await doc.ref.delete();
      removed++;
    }
  }

  if (removed) logger.info(`[Cleanup] Removed ${removed} expired location(s)`);
  return removed;
}

async function runMaintenanceJobs() {
  const locations = await purgeExpiredLocations();
  const zones = await zoneService.expireOldZones();
  const checkIns = await checkInService.processOverdueCheckIns();
  return { locations, zones, checkIns };
}

function startMaintenanceScheduler(intervalMs = 15 * 60 * 1000) {
  runMaintenanceJobs().catch((err) => logger.error('[Cleanup] initial run failed:', err.message));
  return setInterval(() => {
    runMaintenanceJobs().catch((err) => logger.error('[Cleanup] scheduled run failed:', err.message));
  }, intervalMs);
}

module.exports = { purgeExpiredLocations, runMaintenanceJobs, startMaintenanceScheduler };
