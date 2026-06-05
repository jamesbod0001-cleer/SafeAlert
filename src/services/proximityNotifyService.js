const notifyQueue = require('./notifyQueue');
const { getNearbyUsers } = require('./geoService');
const pushService = require('./pushService');
const smsService = require('./smsService');
const appConfig = require('../config/appConfig');
const logger = require('../utils/logger');

async function notifyZoneNearbyUsers(zone, radiusKm) {
  const nearbyUsers = await getNearbyUsers(zone.lat, zone.lng, radiusKm);
  if (nearbyUsers.length > 0) {
    await pushService.notifyNearbyUsers({ zone, users: nearbyUsers });
  }
  return nearbyUsers.length;
}

async function notifyCriticalZone(zone) {
  const radius = appConfig.defaultNotifyRadiusKm;
  const nearbyUsers = await getNearbyUsers(zone.lat, zone.lng, radius);
  let fcmCount = 0;
  let smsCount = 0;

  if (nearbyUsers.length > 0) {
    await pushService.notifyNearbyUsers({ zone, users: nearbyUsers });
    fcmCount = nearbyUsers.length;
  }

  if (appConfig.criticalZoneSmsEnabled && appConfig.criticalZoneSmsMax > 0) {
    const phones = nearbyUsers
      .map((u) => u.phone)
      .filter(Boolean)
      .slice(0, appConfig.criticalZoneSmsMax);
    if (phones.length > 0) {
      await smsService.sendZoneAlertSMS({ phones, zone });
      smsCount = phones.length;
    }
  }

  logger.info(`Critical zone notify: ${zone.id} FCM:${fcmCount} SMS:${smsCount}`);
  return { fcmCount, smsCount };
}

function enqueueZoneCreatedNotify(zone) {
  notifyQueue.enqueueNamed('zone-created', () =>
    notifyZoneNearbyUsers(zone, appConfig.defaultNotifyRadiusKm).catch((err) => {
      logger.error('Zone created notify failed:', err.message);
    })
  );
}

function enqueueCriticalZoneNotify(zone) {
  notifyQueue.enqueueNamed('zone-critical', () =>
    notifyCriticalZone(zone).catch((err) => {
      logger.error('Critical zone notify failed:', err.message);
    })
  );
}

module.exports = {
  notifyZoneNearbyUsers,
  notifyCriticalZone,
  enqueueZoneCreatedNotify,
  enqueueCriticalZoneNotify,
};
