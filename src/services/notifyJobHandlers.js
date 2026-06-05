const appConfig = require('../config/appConfig');
const panicService = require('./panicService');
const proximityNotifyService = require('./proximityNotifyService');
const zoneService = require('./zoneService');
const logger = require('../utils/logger');

function requireZoneId(payload) {
  if (!payload?.zoneId) {
    throw new Error('zoneId is required for zone notify jobs');
  }
  return payload.zoneId;
}

async function loadZoneOrSkip(zoneId) {
  const zone = await zoneService.getZoneById(zoneId);
  if (!zone) {
    logger.warn(`[NotifyJobs] Zone ${zoneId} not found, skipping notify job`);
    return null;
  }
  return zone;
}

function registerNotifyJobHandlers({ registerHandler }) {
  registerHandler('panic-notify', async (payload) => {
    await panicService.runPanicNotifyJob(payload);
  });

  registerHandler('panic-broadcast', async (payload) => {
    await panicService.runPanicBroadcastJob(payload);
  });

  registerHandler('zone-created', async (payload) => {
    const zone = await loadZoneOrSkip(requireZoneId(payload));
    if (!zone) return;
    await proximityNotifyService.notifyZoneNearbyUsers(zone, appConfig.defaultNotifyRadiusKm);
  });

  registerHandler('zone-critical', async (payload) => {
    const zone = await loadZoneOrSkip(requireZoneId(payload));
    if (!zone) return;
    await proximityNotifyService.notifyCriticalZone(zone);
  });
}

module.exports = { registerNotifyJobHandlers };
