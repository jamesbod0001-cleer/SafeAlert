#!/usr/bin/env node
/**
 * Ensures Firestore app_settings/global exists (routes, incident types, etc.)
 */
require('dotenv').config();

const appConfig = require('../src/config/appConfig');
const { initFirebase, isMemoryDb } = require('../src/config/firebase');
const { db } = require('../src/config/db');
const configService = require('../src/services/configService');

async function main() {
  initFirebase();
  const database = db();
  const doc = database.collection('app_settings').doc(configService.SETTINGS_DOC);
  const snap = await doc.get();

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
    await doc.set(payload);
    console.log('[ok] Created app_settings/global');
  } else {
    await doc.set(payload, { merge: true });
    console.log('[ok] Updated app_settings/global');
  }

  if (isMemoryDb()) console.log('[note] Using in-memory DB');
  else console.log('[note] Firestore database:', process.env.FIRESTORE_DATABASE_ID || 'safealert');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
