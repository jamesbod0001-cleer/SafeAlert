const appConfig = require('./appConfig');
const { db } = require('./db');
const configService = require('../services/configService');

async function ensureAppSettings() {
  const database = db();
  const ref = database.collection('app_settings').doc(configService.SETTINGS_DOC);
  const snap = await ref.get();

  const payload = {
    app_name: appConfig.appName,
    map_url: appConfig.mapUrl,
    ussd_service_code: appConfig.ussdServiceCode,
    incident_types: appConfig.incidentTypes.length
      ? appConfig.incidentTypes
      : ['kidnapping', 'armed_robbery', 'banditry', 'terror', 'roadblock', 'suspicious'],
    emergency_contacts: appConfig.emergencyContacts,
    updated_at: new Date().toISOString(),
  };

  if (!snap.exists) {
    await ref.set(payload);
  } else {
    await ref.set(payload, { merge: true });
  }
}

module.exports = { ensureAppSettings };
