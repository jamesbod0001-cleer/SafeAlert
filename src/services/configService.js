const { db } = require('../config/db');
const appConfig = require('../config/appConfig');

const SETTINGS_DOC = 'global';

async function getSettings() {
  try {
    const snap = await db().collection('app_settings').doc(SETTINGS_DOC).get();
    if (snap.exists) return { ...defaultsFromEnv(), ...snap.data() };
  } catch (_) {
    /* fall through */
  }
  return defaultsFromEnv();
}

const nigeriaEmergencyContacts = require('../config/nigeriaEmergencyContacts');

function defaultsFromEnv() {
  return {
    app_name: appConfig.appName,
    map_url: appConfig.mapUrl,
    ussd_service_code: appConfig.ussdServiceCode,
    incident_types: appConfig.incidentTypes,
    emergency_contacts: appConfig.emergencyContacts,
    emergency_contacts_grouped: appConfig.emergencyContactsGrouped || nigeriaEmergencyContacts.groups,
    emergency_contacts_disclaimer: appConfig.emergencyContactsDisclaimer || nigeriaEmergencyContacts.disclaimer,
    budget_mode: appConfig.budgetMode,
    data_saver_recommended: true,
    guest_features: ['view_map', 'report_zones', 'offline_packs', 'share_alerts'],
    sign_in_for: ['panic', 'safety_circle', 'help_nearby', 'journey_watch'],
  };
}

async function getIncidentTypes() {
  const settings = await getSettings();
  const types = settings.incident_types || [];
  if (types.length === 0) {
    throw new Error('No incident types configured. Set INCIDENT_TYPES in .env or app_settings/global');
  }
  return types;
}

async function getEmergencyContacts() {
  const settings = await getSettings();
  return settings.emergency_contacts || [];
}

async function getAppMeta() {
  const settings = await getSettings();
  return {
    appName: settings.app_name || appConfig.appName,
    mapUrl: settings.map_url || appConfig.mapUrl,
    ussdServiceCode: settings.ussd_service_code || appConfig.ussdServiceCode,
  };
}

module.exports = {
  getSettings,
  getIncidentTypes,
  getEmergencyContacts,
  getAppMeta,
  SETTINGS_DOC,
};
