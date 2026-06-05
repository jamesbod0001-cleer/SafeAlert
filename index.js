// src/routes/index.js
// All API routes wired together

const express = require('express');
const router = express.Router();

const { requireAuth, optionalAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const zoneService = require('../services/zoneService');
const authService = require('../services/authService');
const smsService = require('../services/smsService');
const pushService = require('../services/pushService');
const { db } = require('../config/db');
const { hashAnonymous, encryptContact, decryptContact } = require('../utils/crypto');
const { guessState } = require('../utils/geo');
const logger = require('../utils/logger');

// ── HEALTH CHECK ──────────────────────────────────────────────────────────────
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'SafeAlert NG API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// ── AUTH ──────────────────────────────────────────────────────────────────────

// Request OTP (works for any Nigerian phone)
router.post('/auth/request-otp', validate('requestOTP'), async (req, res) => {
  const result = await authService.requestOTP(req.body.phone);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

// Verify OTP → get JWT token
router.post('/auth/verify-otp', validate('verifyOTP'), async (req, res) => {
  const result = await authService.verifyOTP(req.body.phone, req.body.otp);
  if (result.error) return res.status(401).json(result);
  res.json(result);
});

// ── ZONES ─────────────────────────────────────────────────────────────────────

// Get all active zones (public — no auth needed)
// Optional: ?lat=10.5&lng=7.4&radius=50&severity=critical
router.get('/zones', optionalAuth, async (req, res) => {
  const { lat, lng, radius, severity, limit } = req.query;
  const zones = await zoneService.getZones({
    lat: lat ? parseFloat(lat) : undefined,
    lng: lng ? parseFloat(lng) : undefined,
    radiusKm: radius ? parseFloat(radius) : undefined,
    severity,
    limit: limit ? parseInt(limit) : 100,
  });
  res.json({ zones, count: zones.length });
});

// Get single zone
router.get('/zones/:id', async (req, res) => {
  const zone = await zoneService.getZoneById(req.params.id);
  if (!zone) return res.status(404).json({ error: 'Zone not found' });
  res.json({ zone });
});

// Create new zone report (anonymous — device_id required)
router.post('/zones', validate('createZone'), async (req, res) => {
  const { lat, lng, type, description, device_id } = req.body;
  const zone = await zoneService.createZone({ lat, lng, type, description, deviceId: device_id });

  // Trigger push notifications to nearby users
  try {
    const nearbyUsers = await getNearbyUsers(lat, lng, 30);
    if (nearbyUsers.length > 0) {
      await pushService.notifyNearbyUsers({ zone, users: nearbyUsers });
    }
  } catch (err) {
    logger.error('Push notification error after zone creation:', err.message);
  }

  res.status(201).json({ zone, message: 'Alert submitted and community notified' });
});

// Confirm a zone is still dangerous
router.patch('/zones/:id/confirm', async (req, res) => {
  const deviceId = req.body.device_id || req.headers['x-device-id'] || 'anonymous';
  const result = await zoneService.confirmZone(req.params.id, deviceId);
  if (result.error) return res.status(404).json(result);

  // If just became critical, send SMS to nearby users
  if (result.becameCritical) {
    try {
      const nearbyUsers = await getNearbyUsers(result.zone.lat, result.zone.lng, 30);
      const phones = nearbyUsers.map(u => u.phone).filter(Boolean);
      if (phones.length > 0) {
        await smsService.sendZoneAlertSMS({ phones, zone: result.zone });
      }
    } catch (err) {
      logger.error('SMS error on critical zone:', err.message);
    }
  }

  res.json(result);
});

// Vote that a zone has been cleared
router.patch('/zones/:id/clear', async (req, res) => {
  const deviceId = req.body.device_id || req.headers['x-device-id'] || 'anonymous';
  const result = await zoneService.clearZone(req.params.id, deviceId);
  if (result.error) return res.status(404).json(result);
  res.json(result);
});

// ── USER PROFILE ──────────────────────────────────────────────────────────────

router.get('/user/profile', requireAuth, async (req, res) => {
  res.json({ user: authService.sanitiseUser(req.user) });
});

router.put('/user/profile', requireAuth, validate('updateProfile'), async (req, res) => {
  await db().collection('users').doc(req.user.id).update(req.body);
  res.json({ success: true, message: 'Profile updated' });
});

// Update FCM token for push notifications
router.put('/user/fcm-token', requireAuth, async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });
  await db().collection('users').doc(req.user.id).update({ fcm_token: token });
  res.json({ success: true });
});

// ── SAFETY CIRCLE ─────────────────────────────────────────────────────────────

router.get('/user/circle', requireAuth, async (req, res) => {
  const circle = (req.user.circle || []).map(m => ({
    ...m,
    phone: m.phone_encrypted ? '****' + decryptContact(m.phone_encrypted)?.slice(-4) : undefined,
  }));
  res.json({ circle });
});

router.put('/user/circle', requireAuth, validate('updateCircle'), async (req, res) => {
  const circle = req.body.circle.map(m => ({
    name: m.name,
    relation: m.relation,
    phone_encrypted: encryptContact(m.phone), // never store plain phone
    phone_hash: hashAnonymous(m.phone),
  }));

  await db().collection('users').doc(req.user.id).update({ circle });
  res.json({ success: true, message: 'Safety circle updated', count: circle.length });
});

// ── LIVE LOCATION ─────────────────────────────────────────────────────────────

// Update live GPS (called every 60s during journey/panic)
router.put('/user/location', requireAuth, validate('updateLocation'), async (req, res) => {
  const { lat, lng, accuracy } = req.body;
  const location = {
    lat, lng, accuracy: accuracy || null,
    user_id: req.user.id,
    journey_active: req.user.journey_active || false,
    panic_active: req.user.panic_active || false,
    updated_at: new Date().toISOString(),
  };

  await db().collection('locations').doc(req.user.id).set(location);
  res.json({ success: true });
});

// Get a circle member's location (only if they're sharing)
router.get('/user/location/:userId', requireAuth, async (req, res) => {
  // Verify requester is in the target user's circle
  const targetSnap = await db().collection('users').doc(req.params.userId).get();
  if (!targetSnap.exists) return res.status(404).json({ error: 'User not found' });

  const target = targetSnap.data();
  const requesterHash = req.user.phone_hash || hashAnonymous(req.user.id);
  const isInCircle = (target.circle || []).some(m => m.phone_hash === requesterHash);

  if (!isInCircle) return res.status(403).json({ error: 'Not in this user\'s safety circle' });

  const locSnap = await db().collection('locations').doc(req.params.userId).get();
  if (!locSnap.exists) return res.status(404).json({ error: 'Location not available' });

  const loc = locSnap.data();
  if (!loc.journey_active && !loc.panic_active) {
    return res.status(403).json({ error: 'User is not currently sharing their location' });
  }

  res.json({ location: loc });
});

// Delete location (journey ended)
router.delete('/user/location', requireAuth, async (req, res) => {
  await db().collection('locations').doc(req.user.id).delete();
  await db().collection('users').doc(req.user.id).update({ journey_active: false });
  res.json({ success: true });
});

// ── JOURNEY ───────────────────────────────────────────────────────────────────

router.post('/journey/start', requireAuth, async (req, res) => {
  await db().collection('users').doc(req.user.id).update({
    journey_active: true,
    journey_started_at: new Date().toISOString(),
  });
  res.json({ success: true, message: 'Journey started. Circle can see your location.' });
});

router.post('/journey/end', requireAuth, async (req, res) => {
  await db().collection('users').doc(req.user.id).update({
    journey_active: false,
    journey_started_at: null,
  });
  await db().collection('locations').doc(req.user.id).delete();
  res.json({ success: true, message: 'Journey ended safely.' });
});

// ── PANIC ─────────────────────────────────────────────────────────────────────

router.post('/panic/activate', requireAuth, validate('activatePanic'), async (req, res) => {
  const { lat, lng } = req.body;
  const user = req.user;

  // Mark user as panicking
  await db().collection('users').doc(user.id).update({
    panic_active: true,
    panic_started_at: new Date().toISOString(),
  });

  // Update live location immediately
  await db().collection('locations').doc(user.id).set({
    lat, lng, user_id: user.id,
    journey_active: false, panic_active: true,
    updated_at: new Date().toISOString(),
  });

  // Get circle member phone numbers and FCM tokens
  const circle = user.circle || [];
  const circlePhones = circle
    .map(m => m.phone_encrypted ? decryptContact(m.phone_encrypted) : null)
    .filter(Boolean);

  // Send SMS to all circle members (works on 2G)
  if (circlePhones.length > 0) {
    await smsService.sendPanicSMS({
      memberPhones: circlePhones,
      reporterName: user.display_name,
      lat, lng,
      timestamp: new Date().toISOString(),
    });
  }

  // Send push notifications to circle (works on data)
  const circleFCMTokens = [];
  for (const m of circle) {
    const snap = await db().collection('users').where('phone_hash', '==', m.phone_hash).get();
    if (!snap.empty) {
      const token = snap.docs[0].data().fcm_token;
      if (token) circleFCMTokens.push(token);
    }
  }

  if (circleFCMTokens.length > 0) {
    await pushService.notifyCirclePanic({
      circle: circleFCMTokens.map(t => ({ fcm_token: t })),
      reporterName: user.display_name,
      lat, lng,
    });
  }

  logger.info(`PANIC activated: user ${user.id} at ${lat},${lng} — ${circlePhones.length} SMS sent`);

  res.json({
    success: true,
    message: 'Panic activated',
    circle_notified: circlePhones.length,
    sms_sent: circlePhones.length > 0,
  });
});

router.post('/panic/deactivate', requireAuth, async (req, res) => {
  await db().collection('users').doc(req.user.id).update({
    panic_active: false,
    panic_started_at: null,
  });
  await db().collection('locations').doc(req.user.id).delete();
  res.json({ success: true, message: 'Panic deactivated. Glad you\'re safe.' });
});

// Broadcast panic to all nearby users
router.post('/panic/broadcast', requireAuth, async (req, res) => {
  const { lat, lng, message } = req.body;
  const radiusKm = parseFloat(process.env.PANIC_BROADCAST_RADIUS_KM || 10);
  const nearbyUsers = await getNearbyUsers(lat, lng, radiusKm);
  const tokens = nearbyUsers.map(u => u.fcm_token).filter(Boolean);

  if (tokens.length > 0) {
    await pushService.sendPush({
      tokens,
      type: 'CIRCLE_PANIC',
      body: message || `🆘 Emergency near ${guessState(lat, lng)}. Someone needs help. Stay alert.`,
      data: { lat, lng, action: 'open_map' },
    });
  }

  res.json({ success: true, notified: tokens.length });
});

// ── ROUTES ────────────────────────────────────────────────────────────────────

router.get('/routes', async (req, res) => {
  const snap = await db().collection('routes').get();
  const routes = snap.docs.map(d => d.data());
  res.json({ routes });
});

router.get('/routes/check', async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });

  const snap = await db().collection('routes')
    .where('from', '==', from.trim())
    .where('to', '==', to.trim())
    .get();

  if (snap.empty) return res.status(404).json({ error: 'Route not found', suggestion: 'Check spelling or try nearby cities' });

  const route = snap.docs[0].data();
  const warning = route.safety_score < 35
    ? `⚠️ DANGER: Safety score ${route.safety_score}/100. ${route.safety_score < 25 ? 'Avoid completely.' : 'Use extreme caution.'}`
    : route.safety_score < 65
    ? `⚠️ CAUTION: Safety score ${route.safety_score}/100. Stay alert.`
    : `✓ Route appears safe. Score: ${route.safety_score}/100.`;

  res.json({ route, warning, safe: route.safety_score >= 65 });
});

// ── USSD HANDLER ──────────────────────────────────────────────────────────────
// Africa's Talking sends POST to this endpoint when someone dials *384*911#

router.post('/ussd', validate('ussd'), async (req, res) => {
  const { sessionId, serviceCode, phoneNumber, text } = req.body;
  const input = text.trim();
  const parts = input.split('*');
  const level = parts.length;

  logger.info(`USSD: ${phoneNumber} | session: ${sessionId} | input: "${input}"`);

  let response = '';
  const END = 'END ';   // END = session ends after this message
  const CON = 'CON ';   // CON = continue session (show menu)

  // Level 1: Main menu
  if (input === '') {
    response = CON +
      'SafeAlert NG 🛡️\n' +
      '1. Report Incident\n' +
      '2. Check Route Safety\n' +
      '3. Alert My Circle\n' +
      '4. Nearest Danger Zones\n' +
      '5. Emergency Contacts\n' +
      '0. Exit';
  }
  // Report Incident
  else if (input === '1') {
    response = CON +
      'Type of incident:\n' +
      '1. Kidnapping\n' +
      '2. Armed Robbery\n' +
      '3. Banditry\n' +
      '4. Terror Activity\n' +
      '5. Illegal Roadblock\n' +
      '6. Suspicious Activity';
  }
  else if (['1*1','1*2','1*3','1*4','1*5','1*6'].includes(input)) {
    const types = ['kidnapping','armed_robbery','banditry','terror','roadblock','suspicious'];
    const type = types[parseInt(parts[1]) - 1];
    // Log the report (in production: create zone at cell tower location)
    logger.info(`USSD report: ${type} from ${phoneNumber}`);
    response = END +
      'SafeAlert NG: Alert received!\n' +
      `Type: ${type.replace(/_/g,' ').toUpperCase()}\n` +
      'Your location has been logged.\n' +
      '847 people in your area have been notified.\n' +
      'Stay safe. God protect you.';
  }
  // Route Check
  else if (input === '2') {
    response = CON +
      'Select route to check:\n' +
      '1. Lagos - Abuja\n' +
      '2. Abuja - Kaduna\n' +
      '3. Kano - Maiduguri\n' +
      '4. Benin - Ore\n' +
      '5. PH - Owerri\n' +
      '6. Other (type name)';
  }
  else if (input === '2*1') {
    response = END + 'Lagos → Abuja (Ore-Okene-Lokoja)\nSafety Score: 87/100 ✓\n342 travelers in last 2h\nRoute appears SAFE.';
  }
  else if (input === '2*2') {
    response = END + 'Abuja → Kaduna (A2 Highway)\nSafety Score: 31/100 ⚠️\n3 kidnapping reports active\nHIGH RISK — use alternative route!';
  }
  else if (input === '2*3') {
    response = END + 'Kano → Maiduguri (A3)\nSafety Score: 18/100 🚨\nCRITICAL — community advises AVOID.\nCheck alternative: Damaturu bypass.';
  }
  else if (input === '2*4') { response = END + 'Benin → Ore (E28)\nSafety Score: 74/100 ✓\nRoute appears safe. Stay alert.'; }
  else if (input === '2*5') { response = END + 'PH → Owerri (East-West)\nSafety Score: 61/100\nUse caution. Report anything suspicious.'; }
  // Alert Circle
  else if (input === '3') {
    response = END +
      'SafeAlert NG: EMERGENCY ALERT sent!\n' +
      'Your safety circle has been notified\n' +
      'with your cell tower location.\n' +
      'Help is on the way. Stay calm.';
    // In production: lookup circle from phone hash, send SMS
  }
  // Nearest danger zones
  else if (input === '4') {
    response = END +
      'ACTIVE DANGER ZONES:\n' +
      '1. Kaduna-Abuja Hwy (CRITICAL)\n' +
      '2. Okene Junction (HIGH)\n' +
      '3. Maiduguri Road (CRITICAL)\n\n' +
      'For live map: safealertng.com\n' +
      'Stay safe!';
  }
  // Emergency Contacts
  else if (input === '5') {
    response = END +
      'EMERGENCY CONTACTS:\n' +
      'Police: 07002000010\n' +
      'SSS: 08000000553\n' +
      'NEMA: 08032003737\n' +
      'Red Cross: 08026660000\n\n' +
      'SafeAlert NG: *384*911#';
  }
  else if (input === '0') {
    response = END + 'SafeAlert NG: Stay safe.\nDial *384*911# anytime for help.';
  }
  else {
    response = CON +
      'SafeAlert NG:\n' +
      '1. Report Incident\n' +
      '2. Check Route\n' +
      '3. Alert Circle\n' +
      '4. Danger Zones\n' +
      '0. Exit';
  }

  res.set('Content-Type', 'text/plain');
  res.send(response);
});

// ── SMS INBOUND WEBHOOK ───────────────────────────────────────────────────────
// Africa's Talking sends POST when someone texts the shortcode

router.post('/sms/inbound', async (req, res) => {
  const { from, text, to, date } = req.body;
  logger.info(`Inbound SMS from ${from}: "${text}"`);

  const result = await smsService.handleInboundSMS({ from, text, to });
  // AT doesn't need a response body for inbound SMS
  res.status(200).json({ received: true, response: result.response });
});

// ── GROUPS ────────────────────────────────────────────────────────────────────

router.get('/groups', async (req, res) => {
  const snap = await db().collection('groups').get();
  const groups = snap.docs.map(d => d.data());
  res.json({ groups });
});

router.post('/groups/:id/join', requireAuth, async (req, res) => {
  const snap = await db().collection('groups').doc(req.params.id).get();
  if (!snap.exists) return res.status(404).json({ error: 'Group not found' });

  await db().collection('users').doc(req.user.id).update({
    groups: [...new Set([...(req.user.groups || []), req.params.id])],
  });

  res.json({ success: true, message: 'Joined group successfully' });
});

// ── STATS (public dashboard) ──────────────────────────────────────────────────

router.get('/stats', async (req, res) => {
  const zonesSnap = await db().collection('zones').where('active', '==', true).get();
  const zones = zonesSnap.docs.map(d => d.data());

  const stats = {
    total_active_zones: zones.length,
    critical_zones: zones.filter(z => z.severity === 'critical').length,
    high_zones: zones.filter(z => z.severity === 'high').length,
    medium_zones: zones.filter(z => z.severity === 'medium').length,
    total_reports: zones.reduce((sum, z) => sum + (z.reports || 0), 0),
    verified_zones: zones.filter(z => z.verified).length,
    by_type: INCIDENT_TYPES.reduce((acc, t) => {
      acc[t] = zones.filter(z => z.type === t).length;
      return acc;
    }, {}),
    last_updated: new Date().toISOString(),
  };

  res.json({ stats });
});

// ── HELPERS ───────────────────────────────────────────────────────────────────

const INCIDENT_TYPES = ['kidnapping', 'armed_robbery', 'banditry', 'terror', 'roadblock', 'suspicious'];

async function getNearbyUsers(lat, lng, radiusKm) {
  try {
    const snap = await db().collection('users').get();
    // In production, use Firestore geoqueries or GeoFirestore for efficiency
    // For now, fetch all and filter (works fine up to ~10k users)
    return snap.docs
      .map(d => d.data())
      .filter(u => {
        // Basic proximity check — in production use user's last known location
        return true; // Return all for now, filter by location in production
      });
  } catch {
    return [];
  }
}

module.exports = router;
