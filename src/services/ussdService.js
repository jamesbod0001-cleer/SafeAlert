const { db } = require('../config/db');
const { hashAnonymous, decryptContact } = require('../utils/crypto');
const zoneService = require('./zoneService');
const smsService = require('./smsService');
const configService = require('./configService');
const routeService = require('./routeService');
const appConfig = require('../config/appConfig');
const logger = require('../utils/logger');

const END = 'END ';
const CON = 'CON ';

function formatIncidentLabel(type) {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

async function listRoutes(limit) {
  const snap = await db().collection('routes').orderBy('last_updated', 'desc').limit(50).get();
  return snap.docs
    .map((d) => d.data())
    .sort((a, b) => `${a.from}${a.to}`.localeCompare(`${b.from}${b.to}`))
    .slice(0, limit);
}

async function lookupRouteByIndex(menuIndex) {
  const routes = await listRoutes(appConfig.ussdMaxRoutesMenu);
  return routes[menuIndex - 1] || null;
}

async function lookupRoute(from, to) {
  const snap = await db()
    .collection('routes')
    .where('from', '==', from)
    .where('to', '==', to)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0].data();
}

async function getActiveZonesSummary(limit) {
  const zones = await zoneService.getZones({ limit: 50 });
  const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  return zones
    .sort((a, b) => (sevOrder[a.severity] ?? 3) - (sevOrder[b.severity] ?? 3))
    .slice(0, limit);
}

async function recordUssdIncident({ phoneNumber, type }) {
  const phoneHash = hashAnonymous(phoneNumber.replace(/\s/g, ''));
  const now = new Date().toISOString();

  await db().collection('ussd_reports').add({
    phone_hash: phoneHash,
    type,
    channel: 'ussd',
    status: 'pending_location',
    created_at: now,
  });

  logger.info(`USSD incident report: ${type} from ${phoneHash.slice(0, 8)}...`);
}

async function alertCircleByPhone(phoneNumber) {
  const phoneHash = hashAnonymous(phoneNumber.replace(/\s/g, ''));
  const snap = await db().collection('users').where('phone_hash', '==', phoneHash).limit(1).get();

  if (snap.empty) {
    return { notified: 0, message: 'Register in the app first to use circle alerts.' };
  }

  const user = snap.docs[0].data();
  const circle = user.circle || [];
  const phones = circle
    .map((m) => (m.phone_encrypted ? decryptContact(m.phone_encrypted) : null))
    .filter(Boolean);

  if (phones.length === 0) {
    return { notified: 0, message: 'No safety circle configured. Add contacts in the app.' };
  }

  if (process.env.PANIC_SMS_ENABLED !== 'false') {
    await smsService.sendPanicSMS({
      memberPhones: phones,
      reporterName: user.display_name,
      lat: null,
      lng: null,
      timestamp: new Date().toISOString(),
    });
  }

  return { notified: phones.length, message: `Circle alerted (${phones.length} contacts).` };
}

async function buildIncidentMenu() {
  const types = await configService.getIncidentTypes();
  const lines = types.map((t, i) => `${i + 1}. ${formatIncidentLabel(t)}`);
  return CON + 'Type of incident:\n' + lines.join('\n');
}

async function buildRoutesMenu() {
  const routes = await listRoutes(appConfig.ussdMaxRoutesMenu);
  if (routes.length === 0) {
    return END + 'No routes configured yet. Check again later.';
  }
  const lines = routes.map((r, i) => `${i + 1}. ${r.from} - ${r.to}`);
  return CON + 'Select route to check:\n' + lines.join('\n');
}

async function buildEmergencyMenu() {
  const contacts = await configService.getEmergencyContacts();
  const meta = await configService.getAppMeta();
  if (contacts.length === 0) {
    return END + 'No emergency contacts configured.';
  }
  const lines = contacts.map((c) => `${c.name}: ${c.phone}`);
  const ussdLine = meta.ussdServiceCode ? `\n${meta.appName}: ${meta.ussdServiceCode}` : '';
  return END + 'EMERGENCY CONTACTS:\n' + lines.join('\n') + ussdLine;
}

async function buildZonesMenu() {
  const zones = await getActiveZonesSummary(appConfig.ussdMaxZonesMenu);
  const meta = await configService.getAppMeta();
  if (zones.length === 0) {
    return END + 'No active danger zones right now.';
  }
  const lines = zones.map(
    (z, i) => `${i + 1}. ${z.label || formatIncidentLabel(z.type)} (${(z.severity || '').toUpperCase()})`
  );
  const mapLine = meta.mapUrl ? `\n\nLive map: ${meta.mapUrl}` : '';
  return END + 'ACTIVE ZONES:\n' + lines.join('\n') + mapLine;
}

async function handleSession({ phoneNumber, text }) {
  const input = (text || '').trim();
  const meta = await configService.getAppMeta();
  const incidentTypes = await configService.getIncidentTypes();

  if (input === '') {
    return (
      CON +
      `${meta.appName} 🛡️\n` +
      '1. Report Incident\n' +
      '2. Check Route Safety\n' +
      '3. Alert My Circle\n' +
      '4. Active Danger Zones\n' +
      '5. Emergency Contacts\n' +
      '0. Exit'
    );
  }

  if (input === '1') {
    return buildIncidentMenu();
  }

  if (input.startsWith('1*')) {
    const idx = parseInt(input.split('*')[1], 10);
    const type = incidentTypes[idx - 1];
    if (!type) {
      return CON + 'Invalid selection.\n' + (await buildIncidentMenu()).replace(CON, '');
    }
    await recordUssdIncident({ phoneNumber, type });
    return (
      END +
      `Report logged: ${formatIncidentLabel(type)}.\n` +
      'Open the app to add your GPS.\n' +
      'Community will be notified when verified.'
    );
  }

  if (input === '2') {
    return buildRoutesMenu();
  }

  if (input.startsWith('2*')) {
    const idx = parseInt(input.split('*')[1], 10);
    const route = await lookupRouteByIndex(idx);
    if (!route) {
      return END + 'Route not found. No safety data available yet.';
    }
    return END + routeService.formatRouteUssd(route);
  }

  if (input === '3') {
    const result = await alertCircleByPhone(phoneNumber);
    return END + `${meta.appName}: ${result.message}`;
  }

  if (input === '4') {
    return buildZonesMenu();
  }

  if (input === '5') {
    return buildEmergencyMenu();
  }

  if (input === '0') {
    const dial = meta.ussdServiceCode ? ` Dial ${meta.ussdServiceCode} anytime.` : '';
    return END + `Stay safe.${dial}`;
  }

  return (
    CON +
    `${meta.appName}\n` +
    '1. Report\n2. Route\n3. Circle\n4. Zones\n0. Exit'
  );
}

module.exports = {
  handleSession,
  lookupRoute,
  recordUssdIncident,
  listRoutes,
};
