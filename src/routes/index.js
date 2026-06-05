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
const ussdService = require('../services/ussdService');
const configService = require('../services/configService');
const routeService = require('../services/routeService');
const aiSummaryService = require('../services/aiSummaryService');
const { isDemoGroup } = require('../constants/demoGroups');
const { FieldValue } = require('firebase-admin/firestore');
const { getNearbyUsers } = require('../services/geoService');
const locationService = require('../services/locationService');
const { sendJsonCached } = require('../utils/httpCache');
const appConfig = require('../config/appConfig');
const { db } = require('../config/db');
const { hashAnonymous, encryptContact, decryptContact } = require('../utils/crypto');
const { guessState } = require('../utils/geo');
const panicService = require('../services/panicService');
const notifyQueue = require('../services/notifyQueue');
const proximityNotifyService = require('../services/proximityNotifyService');
const checkInService = require('../services/checkInService');
const resourceService = require('../services/resourceService');
const responderService = require('../services/responderService');
const convoyService = require('../services/convoyService');
const { isMemoryDb } = require('../config/firebase');
const {
  runLiveDataSync,
  getDailyImportStatus,
} = require('../services/scheduledImportService');
const acledService = require('../services/acledService');
const communityLeaderService = require('../services/communityLeaderService');
const reputationService = require('../services/reputationService');
const whatsappService = require('../services/whatsappService');
const offlinePackService = require('../services/offlinePackService');
const estateService = require('../services/estateService');
const schoolSafetyService = require('../services/schoolSafetyService');
const radioService = require('../services/radioService');
const tipsService = require('../services/tipsService');
const transparencyService = require('../services/transparencyService');
const fallbackData = require('../services/fallbackDataService');
const statsCacheService = require('../services/statsCacheService');
const { LEADER_ROLE_LABELS } = require('../constants/communityRoles');
const { validateProductionEnv } = require('../config/envValidate');
const logger = require('../utils/logger');

// ── HEALTH CHECK ──────────────────────────────────────────────────────────────
router.get('/health', async (req, res) => {
  const envCheck = validateProductionEnv();
  // Fast response for App Runner / load balancers (no Firestore round-trip on every probe)
  let firestore_ok =
    isMemoryDb() || !!(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL);
  if (req.query.deep === '1' && !isMemoryDb()) {
    try {
      await db().collection('app_settings').doc('global').get();
      firestore_ok = true;
    } catch {
      firestore_ok = false;
    }
  }

  const atUser = (process.env.AT_USERNAME || '').trim().toLowerCase();
  const fcmWebOk = !!(
    appConfig.firebaseWebApiKey &&
    appConfig.firebaseWebVapidKey &&
    appConfig.firebaseWebProjectId
  );

  res.json({
    status: firestore_ok ? 'ok' : 'degraded',
    service: 'SafeAlert NG API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: isMemoryDb() ? 'memory' : 'firestore',
    firestore_database_id: process.env.FIRESTORE_DATABASE_ID || 'safealert',
    firestore_ok,
    fallback_data: fallbackData.hasFallback(),
    fallback_zones: fallbackData.getMeta().zone_count || 0,
    proximity_alerts: appConfig.proximityAlertsEnabled,
    push_notifications_enabled: appConfig.pushNotificationsEnabled,
    fcm_web_configured: fcmWebOk,
    sms_username: atUser || null,
    sandbox_otp_in_api: atUser === 'sandbox' || process.env.EXPOSE_SANDBOX_OTP === 'true',
    at_sandbox: atUser === 'sandbox',
    budget_mode: appConfig.budgetMode,
    production_env_ok: envCheck.ok,
    env_warnings: envCheck.warnings,
    features: {
      check_in: true,
      resources: true,
      responders: true,
      convoy: true,
      group_geofence: true,
      estate_watch: true,
      report_false_zone: true,
    },
  });
});

router.get('/config/public', (req, res) => {
  const origin = `${req.protocol}://${req.get('host')}`;
  const downloadPage =
    appConfig.appDownloadUrl ||
    `${origin.replace(/\/$/, '')}/app/download.html`;

  res.json({
    app_name: appConfig.appName,
    map_url: appConfig.mapUrl,
    ussd_service_code: appConfig.ussdServiceCode,
    budget_mode: appConfig.budgetMode,
    data_saver_recommended: true,
    guest_features: ['view_map', 'report_zones', 'offline_packs', 'share_alerts'],
    sign_in_for: ['panic', 'safety_circle', 'help_nearby', 'journey_watch'],
    citizen_sos: true,
    citizen_model:
      'Alerts go to your safety circle and opted-in neighbors via push/WhatsApp — never to government dispatch.',
    mobile: {
      platforms: ['ios', 'android', 'web'],
      ios_app_store_url: appConfig.iosAppStoreUrl || null,
      android_play_store_url: appConfig.androidPlayStoreUrl || null,
      android_apk_url: appConfig.androidApkUrl || null,
      ios_app_id: appConfig.iosAppId || null,
      download_page: downloadPage,
    },
    cost_tips: appConfig.budgetMode
      ? [
          'Map & reports work without sign-in — OTP/SMS only when you need panic or circle.',
          'Keep Data Saver on — uses free push instead of polling.',
          'Download offline state packs on Wi‑Fi before travelling.',
          'Circle alerts use free push when contacts use SafeAlert; SMS only as backup.',
        ]
      : [],
    firebase: appConfig.firebaseWebApiKey
      ? {
          apiKey: appConfig.firebaseWebApiKey,
          authDomain: appConfig.firebaseWebAuthDomain,
          projectId: appConfig.firebaseWebProjectId,
          messagingSenderId: appConfig.firebaseWebMessagingSenderId,
          appId: appConfig.firebaseWebAppId,
          vapidKey: appConfig.firebaseWebVapidKey,
        }
      : null,
  });
});

// ── AUTH ──────────────────────────────────────────────────────────────────────

// Request OTP (works for any Nigerian phone)
const { authLimiter, panicLimiter, locationLimiter } = require('../middleware/rateLimiter');

router.post('/auth/request-otp', authLimiter, validate('requestOTP'), async (req, res) => {
  const result = await authService.requestOTP(req.body.phone);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

// Verify OTP → get JWT token
router.post('/auth/verify-otp', authLimiter, validate('verifyOTP'), async (req, res) => {
  const sessionResult = await authService.verifyOtpFromSession(
    req.body.phone,
    req.body.otp,
    req.body.otp_token
  );
  if (sessionResult) {
    if (sessionResult.error) return res.status(401).json(sessionResult);
    return res.json(sessionResult);
  }
  const result = await authService.verifyOTP(req.body.phone, req.body.otp, req.body.otp_token);
  if (result.error) return res.status(401).json(result);
  res.json(result);
});

// ── ZONES ─────────────────────────────────────────────────────────────────────

// Get all active zones (public — no auth needed)
// Optional: ?lat=10.5&lng=7.4&radius=50&severity=critical
router.get('/zones', optionalAuth, async (req, res) => {
  const { lat, lng, radius, severity, limit, state } = req.query;
  const zones = await zoneService.getZones({
    lat: lat ? parseFloat(lat) : undefined,
    lng: lng ? parseFloat(lng) : undefined,
    radiusKm: radius ? parseFloat(radius) : undefined,
    severity,
    state: state || undefined,
    limit: limit ? parseInt(limit) : 100,
  });
  const payload = { zones, count: zones.length };
  if (fallbackData.hasFallback() && zones[0]?.source === 'hdx_ucdp') {
    const meta = fallbackData.getMeta();
    payload.data_source = meta.source;
    payload.data_note =
      'Live database temporarily limited — showing verified HDX conflict data. Community reports resume when capacity restores.';
    res.setHeader('X-Data-Source', 'fallback');
  }
  sendJsonCached(req, res, payload);
});

// Get single zone
router.get('/zones/:id', async (req, res) => {
  const zone = await zoneService.getZoneById(req.params.id);
  if (!zone) return res.status(404).json({ error: 'Zone not found' });
  res.json({ zone });
});

// Create new zone report (anonymous — device_id required)
router.post('/zones', optionalAuth, validate('createZone'), async (req, res) => {
  const { lat, lng, type, description, device_id } = req.body;
  const zone = await zoneService.createZone({ lat, lng, type, description, deviceId: device_id });
  if (req.user?.id) {
    reputationService.addPoints(req.user.id, 'report_created', { zone_id: zone.id }).catch(() => {});
  }

  proximityNotifyService.enqueueZoneCreatedNotify(zone);

  res.status(201).json({ zone, message: 'Alert submitted — nearby users will be notified' });
});

// Confirm a zone is still dangerous
router.patch('/zones/:id/confirm', optionalAuth, async (req, res) => {
  const deviceId = req.body.device_id || req.headers['x-device-id'] || 'anonymous';
  const result = await zoneService.confirmZone(req.params.id, deviceId);
  if (result.error) return res.status(404).json(result);
  if (req.user?.id && result.justVerified) {
    reputationService.addPoints(req.user.id, 'report_confirmed', { zone_id: req.params.id }).catch(() => {});
  }

  // Critical zones: FCM async; SMS only if explicitly enabled (off by default at scale)
  if (result.becameCritical) {
    proximityNotifyService.enqueueCriticalZoneNotify(result.zone);
  }

  res.json(result);
});

router.post('/zones/:id/report-false', validate('reportFalseZone'), async (req, res) => {
  const result = await zoneService.reportFalseZone(
    req.params.id,
    req.body.device_id,
    req.body.reason
  );
  if (result.error) return res.status(result.status || 404).json(result);
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
  locationService.syncLocationUserFields(req.user.id, { fcm_token: token }).catch(() => {});
  res.json({ success: true });
});

router.post('/user/test-notification', requireAuth, async (req, res) => {
  const pushService = require('../services/pushService');
  if (!req.user.fcm_token) {
    return res.status(400).json({
      error: 'No push token — allow notifications in your browser, then refresh',
    });
  }
  const result = await pushService.sendPush({
    tokens: [req.user.fcm_token],
    type: 'NEAR_YOU',
    body: 'SafeAlert test — notifications are working on this device.',
    data: { alert_type: 'test', action: 'open_home' },
  });
  res.json({
    success: !!result.success,
    sent: result.sent || 0,
    mock: !!result.mock,
  });
});

// Proximity / notification preferences (help nearby opt-in)
router.get('/user/preferences', requireAuth, async (req, res) => {
  res.json({ preferences: authService.getPreferences(req.user) });
});

router.put('/user/preferences', requireAuth, validate('updatePreferences'), async (req, res) => {
  const patch = { preferences_updated_at: new Date().toISOString() };

  if (req.body.help_nearby_enabled !== undefined) {
    patch.help_nearby_enabled = req.body.help_nearby_enabled;
  }
  if (req.body.help_nearby_radius_km !== undefined) {
    patch.help_nearby_radius_km = Math.min(
      appConfig.helpNearbyMaxRadiusKm,
      req.body.help_nearby_radius_km
    );
  }
  if (req.body.notifications_enabled !== undefined) {
    patch.notifications_enabled = req.body.notifications_enabled;
  }
  if (req.body.estate_watch_enabled !== undefined) {
    patch.estate_watch_enabled = req.body.estate_watch_enabled;
  }
  const prefPatch = {};
  if (req.body.night_mode !== undefined) prefPatch.night_mode = req.body.night_mode;
  if (req.body.women_mode !== undefined) prefPatch.women_mode = req.body.women_mode;
  if (req.body.language !== undefined) prefPatch.language = req.body.language;
  if (req.body.data_saver !== undefined) prefPatch.data_saver = req.body.data_saver;
  if (Object.keys(prefPatch).length) {
    patch.preferences = { ...(req.user.preferences || {}), ...prefPatch };
  }

  await db().collection('users').doc(req.user.id).update(patch);
  const snap = await db().collection('users').doc(req.user.id).get();
  const user = { id: req.user.id, ...snap.data() };

  const locFields = {};
  if (req.body.help_nearby_enabled !== undefined) {
    locFields.help_nearby_enabled = !!user.help_nearby_enabled;
  }
  if (req.body.notifications_enabled !== undefined) {
    locFields.notifications_enabled = user.notifications_enabled !== false;
  }
  if (Object.keys(locFields).length) {
    locationService.syncLocationUserFields(req.user.id, locFields).catch(() => {});
  }

  res.json({ success: true, preferences: authService.getPreferences(user) });
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

// Update live GPS (journey, panic, or help-nearby opt-in — throttled)
router.put('/user/location', requireAuth, locationLimiter, validate('updateLocation'), async (req, res) => {
  const { lat, lng, accuracy, journey_active, panic_active } = req.body;
  const userSnap = await db().collection('users').doc(req.user.id).get();
  const user = { id: req.user.id, ...userSnap.data() };

  const result = await locationService.upsertUserLocation(user, lat, lng, accuracy, {
    journey_active: journey_active ?? user.journey_active,
    panic_active: panic_active ?? user.panic_active,
  });

  if (result.error) {
    return res.status(result.status || 400).json({
      error: result.error,
      retryAfterSec: result.retryAfterSec,
    });
  }

  res.json({ success: true, location: result.location });
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

router.post('/journey/end', requireAuth, validate('endJourney'), async (req, res) => {
  const { from, to, via, safety_rating } = req.body || {};
  await db().collection('users').doc(req.user.id).update({
    journey_active: false,
    journey_started_at: null,
    active_convoy_id: null,
  });
  await db().collection('locations').doc(req.user.id).delete();

  let routeResult = null;
  if (from && to && safety_rating) {
    routeResult = await routeService.recordTravellerFeedback({
      from,
      to,
      via,
      safety_rating,
      userId: req.user.id,
    });
  }

  const rated = routeResult && !routeResult.error;
  res.json({
    success: true,
    message: rated
      ? 'Journey ended safely. Thank you for rating this route.'
      : 'Journey ended safely.',
    route_feedback: routeResult?.error
      ? { error: routeResult.error }
      : routeResult?.route
        ? { route: routeResult.route }
        : undefined,
  });
});

router.post('/journey/convoy', requireAuth, validate('createConvoy'), async (req, res) => {
  const result = await convoyService.createConvoy(req.user, req.body);
  res.status(201).json(result);
});

router.get('/journey/convoy/:id', requireAuth, async (req, res) => {
  const result = await convoyService.getConvoy(req.params.id, req.user.id);
  if (!result) return res.status(404).json({ error: 'Convoy not found' });
  if (result.error) return res.status(result.status || 403).json(result);
  res.json(result);
});

router.post('/journey/convoy/:id/end', requireAuth, async (req, res) => {
  const result = await convoyService.endConvoy(req.params.id, req.user.id);
  if (result.error) return res.status(result.status || 400).json(result);
  res.json(result);
});

// ── CHECK-IN ──────────────────────────────────────────────────────────────────

router.post('/check-in', requireAuth, validate('createCheckIn'), async (req, res) => {
  const result = await checkInService.createCheckIn(req.user, req.body);
  if (result.error) return res.status(400).json(result);
  res.status(201).json(result);
});

router.post('/check-in/:id/confirm', requireAuth, async (req, res) => {
  const result = await checkInService.confirmCheckIn(req.user.id, req.params.id);
  if (result.error) return res.status(result.status || 400).json(result);
  res.json(result);
});

router.get('/check-in/active', requireAuth, async (req, res) => {
  const check_in = await checkInService.getActiveCheckIn(req.user.id);
  res.json({ check_in });
});

// ── RESPONDERS ────────────────────────────────────────────────────────────────

router.put('/user/responder-profile', requireAuth, validate('responderProfile'), async (req, res) => {
  const profile = await responderService.updateResponderProfile(req.user.id, req.body);
  res.json({ success: true, responder: profile });
});

router.get('/responders/nearby', requireAuth, async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const radiusKm = parseFloat(req.query.radius_km) || 5;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'lat and lng required' });
  }
  try {
    const responders = await responderService.getNearbyResponders(lat, lng, radiusKm, {
      excludeUserId: req.user.id,
    });
    res.json({ responders, count: responders.length });
  } catch (err) {
    if (fallbackData.isQuotaError(err)) {
      return res.json({
        responders: [],
        count: 0,
        data_note: 'Responder lookup temporarily limited due to Firestore quota.',
      });
    }
    throw err;
  }
});

// ── RESOURCES ─────────────────────────────────────────────────────────────────

router.get('/resources', async (req, res) => {
  try {
    const resources = await resourceService.listResources({
      state: req.query.state,
      lga: req.query.lga,
      type: req.query.type,
      limit: parseInt(req.query.limit, 10) || 50,
    });
    res.json({ resources, count: resources.length });
  } catch (err) {
    if (fallbackData.isQuotaError(err)) {
      return res.json({
        resources: [],
        count: 0,
        data_note: 'Resources feed temporarily limited due to Firestore quota.',
      });
    }
    throw err;
  }
});

router.get('/resources/nearby', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const radiusKm = parseFloat(req.query.radius_km) || 25;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'lat and lng required' });
  }
  try {
    const resources = await resourceService.nearbyResources(lat, lng, radiusKm, req.query.type);
    res.json({ resources, count: resources.length });
  } catch (err) {
    if (fallbackData.isQuotaError(err)) {
      return res.json({
        resources: [],
        count: 0,
        data_note: 'Nearby resources temporarily limited due to Firestore quota.',
      });
    }
    throw err;
  }
});

// ── PANIC ─────────────────────────────────────────────────────────────────────

router.get('/panic/nearby', requireAuth, async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const radiusKm = parseFloat(req.query.radius_km) || appConfig.panicBroadcastRadiusKm;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'lat and lng query params required' });
  }

  try {
    const panics = await panicService.listNearbyActivePanics(lat, lng, radiusKm, req.user.id);
    res.json({ panics, count: panics.length });
  } catch (err) {
    if (fallbackData.isQuotaError(err)) {
      return res.json({
        panics: [],
        count: 0,
        data_note: 'Nearby panic feed temporarily limited due to Firestore quota.',
      });
    }
    throw err;
  }
});

router.get('/panic/mine/active', requireAuth, async (req, res) => {
  const active = await panicService.getActivePanicForUser(req.user.id);
  if (!active) return res.json({ active: null });
  const detail = await panicService.listRespondersForPanic(active.id, req.user.id);
  res.json({
    active: panicService.publicPanicEvent({ id: active.id, ...active }),
    short_id: panicService.shortPanicId(active.id),
    responders: detail.responders || [],
  });
});

router.get('/panic/:id/responders', requireAuth, async (req, res) => {
  const result = await panicService.listRespondersForPanic(req.params.id, req.user.id);
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  res.json(result);
});

router.get('/panic/:id', requireAuth, async (req, res) => {
  const panic = await panicService.getPanicById(req.params.id, req.user.id);
  if (!panic) return res.status(404).json({ error: 'Panic event not found' });
  res.json({ panic });
});

router.post('/panic/:id/dismiss', requireAuth, async (req, res) => {
  const result = await panicService.dismissPanicHelper(
    req.params.id,
    req.user.id,
    req.body.reason || 'cannot_help'
  );
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  res.json({ success: true, message: 'Thanks — marked as unable to help for this alert' });
});

router.post('/panic/:id/respond', requireAuth, async (req, res) => {
  const result = await panicService.addResponder(req.params.id, req.user.id);
  if (result.error) return res.status(result.status || 400).json({ error: result.error });

  let push_sent = false;
  if (result.is_new_response) {
    try {
      const pushResult = await panicService.notifyVictimResponderOnWay(
        result.victim_id,
        req.user,
        req.params.id,
        result.short_id,
        result.responder_count
      );
      push_sent = (pushResult.sent || 0) > 0;
    } catch (err) {
      logger.error('Respond push failed:', err.message);
    }
  }

  res.json({
    success: true,
    message: push_sent
      ? 'They were notified you are on the way'
      : result.is_new_response
        ? 'Marked as responding (enable notifications on their device for alerts)'
        : 'You are already marked as responding',
    responder_count: result.responder_count,
    short_id: result.short_id,
    push_sent,
  });
});

router.post('/panic/activate', requireAuth, panicLimiter, validate('activatePanic'), async (req, res) => {
  const { lat, lng } = req.body;
  const user = req.user;

  const existing = await panicService.getActivePanicForUser(user.id);
  if (existing) {
    return res.status(409).json({
      error: 'Panic is already active — tap "I\'m Safe Now" first',
      panic_id: existing.id,
    });
  }

  const cooldown = await panicService.assertPanicCooldown(user);
  if (cooldown) {
    return res.status(cooldown.status).json({
      error: cooldown.error,
      retryAfterSec: cooldown.retryAfterSec,
    });
  }

  const event = await panicService.createPanicEvent(user, lat, lng);
  const now = new Date().toISOString();

  await db().collection('users').doc(user.id).update({
    panic_active: true,
    panic_started_at: now,
    last_panic_at: now,
    active_panic_id: event.id,
  });

  const updatedUser = { ...user, panic_active: true, journey_active: false, active_panic_id: event.id };
  await locationService.upsertUserLocation(updatedUser, lat, lng, null, {
    journey_active: false,
    panic_active: true,
  });

  const { circlePhones, circleFCMTokens } = await panicService.getCirclePhonesAndTokens(user);

  notifyQueue.enqueueNamed('panic-notify', async () => {
    try {
      const circleResult = await panicService.notifyCircleAsync(
        updatedUser,
        lat,
        lng,
        circlePhones,
        circleFCMTokens,
        event.id
      );

      let nearbyNotified = 0;
      let estateNotified = 0;
      const estate = await panicService.notifyEstateWatchAsync(
        updatedUser,
        lat,
        lng,
        event.id,
        req.body.message
      );
      estateNotified = estate.notified;

      if (appConfig.panicAutoBroadcastEnabled) {
        const nearby = await panicService.notifyNearbyAsync(
          lat,
          lng,
          user.id,
          event.id,
          req.body.message
        );
        nearbyNotified = nearby.notified;
        await db().collection('panic_events').doc(event.id).update({
          circle_notified: circleResult.sms,
          nearby_notified: nearbyNotified,
          estate_notified: estateNotified,
          notified_user_ids: [...new Set([...(nearby.userIds || []), ...(estate.userIds || [])])],
        });
      } else {
        await db().collection('panic_events').doc(event.id).update({
          circle_notified: circleResult.sms,
          estate_notified: estateNotified,
        });
      }

      logger.info(
        `PANIC notify complete: ${event.id} SMS:${circleResult.sms} nearby:${nearbyNotified} estate:${estateNotified}`
      );
    } catch (err) {
      logger.error('Panic notify job failed:', err.message);
    }
  });

  res.status(202).json({
    success: true,
    message: 'Panic activated — notifications sending',
    panic_id: event.id,
    short_id: panicService.shortPanicId(event.id),
    circle_queued: circlePhones.length,
    notifications_async: true,
  });
});

router.post('/panic/deactivate', requireAuth, async (req, res) => {
  await panicService.deactivatePanicEvent(req.user.id);
  await db().collection('users').doc(req.user.id).update({
    panic_active: false,
    panic_started_at: null,
    active_panic_id: null,
  });
  await db().collection('locations').doc(req.user.id).delete();
  res.json({ success: true, message: 'Panic deactivated. Glad you\'re safe.' });
});

router.post('/panic/broadcast', requireAuth, async (req, res) => {
  const lat = parseFloat(req.body.lat);
  const lng = parseFloat(req.body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'lat and lng required' });
  }

  const active = await panicService.getActivePanicForUser(req.user.id);
  const panicId = active?.id || req.body.panic_id;

  notifyQueue.enqueueNamed('panic-broadcast', async () => {
    await panicService.notifyNearbyAsync(lat, lng, req.user.id, panicId, req.body.message);
  });

  res.status(202).json({ success: true, message: 'Broadcast queued', notifications_async: true });
});

// ── ROUTES ────────────────────────────────────────────────────────────────────

router.get('/routes', async (req, res) => {
  try {
    const snap = await db()
      .collection('routes')
      .orderBy('last_updated', 'desc')
      .limit(appConfig.routesMaxList || 100)
      .get();
    const routes = snap.docs
      .map((d) => d.data())
      .filter((r) => !routeService.isBlockedRoute(r));
    res.json({
      routes,
      note:
        routes.length === 0
          ? 'No community route ratings yet — end a Journey and rate your trip (From → To)'
          : undefined,
    });
  } catch (err) {
    if (fallbackData.isQuotaError(err)) {
      return res.json({
        routes: [],
        count: 0,
        data_note: 'Route feed temporarily limited due to Firestore quota.',
      });
    }
    throw err;
  }
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
  const warning = routeService.formatRouteWarning(route);

  res.json({ route, warning, safe: routeService.isRouteSafe(route) });
});

// Public app configuration (incident types, emergency contacts from DB/env)
router.get('/settings', async (req, res) => {
  const settings = await configService.getSettings();
  res.json({ settings });
});

// ── USSD HANDLER ──────────────────────────────────────────────────────────────

router.post('/ussd', validate('ussd'), async (req, res) => {
  const { sessionId, phoneNumber, text } = req.body;
  logger.info(`USSD: ${phoneNumber} | session: ${sessionId} | input: "${text || ''}"`);

  const response = await ussdService.handleSession({
    phoneNumber,
    text: text || '',
  });

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
  try {
    const snap = await db().collection('groups').limit(appConfig.groupsMaxList || 80).get();
    let groups = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (appConfig.blockSimulatedData) {
      groups = groups.filter((g) => !isDemoGroup(g));
    }
    res.json({
      groups,
      note:
        groups.length === 0
          ? 'No community groups yet — create one for your union, market, or estate'
          : undefined,
    });
  } catch (err) {
    if (fallbackData.isQuotaError(err)) {
      return res.json({
        groups: [],
        count: 0,
        data_note: 'Groups feed temporarily limited due to Firestore quota.',
      });
    }
    throw err;
  }
});

router.post('/groups', requireAuth, validate('createGroup'), async (req, res) => {
  const { name, geofence_center, geofence_radius_km } = req.body;
  const id = require('crypto').randomUUID();
  const group = {
    id,
    name,
    geofence_center,
    geofence_radius_km: geofence_radius_km || 5,
    admin_ids: [req.user.id],
    verified_partner: false,
    member_count: 1,
    source: 'community',
    verified_partner: false,
    created_at: new Date().toISOString(),
  };
  await db().collection('groups').doc(id).set(group);
  await db().collection('users').doc(req.user.id).update({
    groups: [...new Set([...(req.user.groups || []), id])],
  });
  res.status(201).json({ group });
});

router.get('/groups/:id/alerts', async (req, res) => {
  const snap = await db().collection('groups').doc(req.params.id).get();
  if (!snap.exists) return res.status(404).json({ error: 'Group not found' });
  const group = snap.data();
  if (!group.geofence_center) {
    return res.json({ zones: [], count: 0, message: 'Group has no geofence' });
  }
  const { lat, lng } = group.geofence_center;
  const radius = group.geofence_radius_km || 5;
  const zones = await zoneService.getZones({ lat, lng, radiusKm: radius, limit: 50 });
  res.json({ group: { id: req.params.id, name: group.name }, zones, count: zones.length });
});

router.post('/groups/:id/join', requireAuth, async (req, res) => {
  const ref = db().collection('groups').doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: 'Group not found' });
  if (appConfig.blockSimulatedData && isDemoGroup({ id: req.params.id, ...snap.data() })) {
    return res.status(410).json({ error: 'This was a demo group and is no longer available' });
  }

  const userGroups = req.user.groups || [];
  const already = userGroups.includes(req.params.id);
  await db().collection('users').doc(req.user.id).update({
    groups: [...new Set([...userGroups, req.params.id])],
  });
  if (!already) {
    await ref.update({ member_count: FieldValue.increment(1) });
  }

  res.json({ success: true, message: 'Joined group successfully' });
});

// ── ESTATE / AREA WATCH ───────────────────────────────────────────────────────

router.get('/estates', async (req, res) => {
  const state = req.query.state;
  const lat = req.query.lat ? parseFloat(req.query.lat) : undefined;
  const lng = req.query.lng ? parseFloat(req.query.lng) : undefined;
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    const estates = await estateService.listNearbyEstates(lat, lng, parseFloat(req.query.radius_km) || 25);
    return res.json({ estates, count: estates.length });
  }
  const estates = await estateService.listEstates({ state, limit: parseInt(req.query.limit, 10) || 40 });
  res.json({ estates, count: estates.length });
});

router.get('/estates/mine', requireAuth, async (req, res) => {
  const estates = await estateService.getUserEstates(req.user.id);
  res.json({ estates, count: estates.length });
});

router.post('/estates/register', requireAuth, validate('registerEstate'), async (req, res) => {
  const result = await estateService.registerEstate(req.user.id, req.body);
  if (result.error) return res.status(result.status || 400).json(result);
  res.status(201).json(result);
});

router.post('/estates/join', requireAuth, validate('joinEstate'), async (req, res) => {
  const result = await estateService.joinEstate(req.user.id, req.body);
  if (result.error) return res.status(result.status || 400).json(result);
  res.json(result);
});

router.post('/estates/:id/leave', requireAuth, async (req, res) => {
  const result = await estateService.leaveEstate(req.user.id, req.params.id);
  if (result.error) return res.status(result.status || 404).json(result);
  res.json(result);
});

router.get('/estates/:id', async (req, res) => {
  const snap = await db().collection('estates').doc(req.params.id).get();
  if (!snap.exists || snap.data().active === false) {
    return res.status(404).json({ error: 'Estate or area not found' });
  }
  res.json({ estate: estateService.publicEstate({ id: snap.id, ...snap.data() }) });
});

router.get('/insights/summary', async (req, res) => {
  const lang = (req.query.lang || 'en').slice(0, 8);
  const { stats, fallback, stale } = await statsCacheService.getStats();
  if (fallback || stale) res.setHeader('X-Data-Source', fallback ? 'fallback' : 'stats-cache-stale');

  const near50 = parseInt(req.query.near50, 10);
  const nearHigh = parseInt(req.query.nearHigh, 10);
  const userState = req.query.user_state || '';
  const area = {
    hasGps: req.query.has_gps === '1',
    near50: Number.isFinite(near50) ? near50 : 0,
    nearHigh: Number.isFinite(nearHigh) ? nearHigh : 0,
    userState,
    inState: parseInt(req.query.in_state, 10) || 0,
  };

  const { summary, source } = await aiSummaryService.generateInsightsSummary({ stats, area, lang });
  sendJsonCached(req, res, { summary, source, generated_at: new Date().toISOString() });
});

// ── STATS (public dashboard) ──────────────────────────────────────────────────

router.get('/stats', async (req, res) => {
  const { stats, from_cache, fallback, stale } = await statsCacheService.getStats();
  const payload = { stats };
  if (fallback) {
    res.setHeader('X-Data-Source', 'fallback');
    payload.data_note =
      'Statistics from bundled HDX cache — Firestore quota limited. Map data still available.';
  } else if (stale) {
    payload.data_note = 'Statistics refreshing — counts may be a few minutes old.';
  } else if (from_cache) {
    res.setHeader('X-Stats-Cache', 'hit');
  }
  sendJsonCached(req, res, payload);
});

// ── SCHEDULED DATA IMPORT (admin) ─────────────────────────────────────────────

function requireImportSecret(req, res, next) {
  const secret = appConfig.importJobSecret;
  if (!secret) {
    return res.status(503).json({ error: 'IMPORT_JOB_SECRET not configured on server' });
  }
  const provided = req.headers['x-import-secret'] || req.body?.secret;
  if (provided !== secret) {
    return res.status(401).json({ error: 'Invalid import secret' });
  }
  next();
}

router.get('/admin/import/status', requireImportSecret, (req, res) => {
  res.json(getDailyImportStatus());
});

router.post('/admin/import/run', requireImportSecret, async (req, res) => {
  const summary = await runLiveDataSync();
  res.json({ success: true, summary });
});

router.post('/admin/stats/refresh', requireImportSecret, async (req, res) => {
  const stats = await statsCacheService.refreshStatsCache();
  res.json({ success: true, stats });
});

router.get('/data/sources', (req, res) => {
  res.json({
    zones: {
      live: ['acled', 'community', 'user_report'],
      blocked_in_api: appConfig.blockSimulatedData
        ? ['safealert_starter', 'review_fixture']
        : [],
    },
    routes: {
      note: 'Route scores are only shown when backed by traveller reports — not simulated',
    },
    acled_configured: acledService.isConfigured(),
  });
});

// ── TIER 1–3: TRUST, REACH, DIFFERENTIATION ───────────────────────────────────

router.get('/transparency', async (req, res) => {
  const report = await transparencyService.getTransparencyReport();
  sendJsonCached(req, res, { report });
});

router.get('/tips', (req, res) => {
  const lang = (req.query.lang || 'en').slice(0, 8);
  const category = req.query.category || '';
  res.json({ tips: tipsService.getTips({ lang, category: category || undefined }) });
});

router.get('/radio/bulletin', async (req, res) => {
  const lang = (req.query.lang || 'en').slice(0, 8);
  const state = req.query.state || '';
  const bulletin = await radioService.generateBulletin({ lang, state: state || undefined });
  sendJsonCached(req, res, bulletin);
});

router.get('/offline/packs', (req, res) => {
  res.json({ packs: offlinePackService.listAvailablePacks() });
});

router.get('/offline/packs/:state', async (req, res) => {
  const pack = await offlinePackService.getPack(req.params.state);
  if (pack.error) return res.status(404).json(pack);
  sendJsonCached(req, res, pack);
});

router.get('/leaders', async (req, res) => {
  const leaders = await communityLeaderService.listLeaders({
    state: req.query.state,
    verifiedOnly: req.query.all !== '1',
  });
  res.json({
    leaders: leaders.map((l) => ({
      ...l,
      role_label: LEADER_ROLE_LABELS[l.role] || l.role,
    })),
  });
});

router.post('/leaders/apply', requireAuth, validate('applyLeader'), async (req, res) => {
  const result = await communityLeaderService.applyForLeader(req.user.id, req.body);
  if (result.error) return res.status(400).json(result);
  res.status(201).json(result);
});

router.post('/leaders/endorse-zone', requireAuth, validate('leaderEndorseZone'), async (req, res) => {
  const result = await communityLeaderService.leaderEndorseZone(req.user.id, req.body.zone_id);
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  res.json(result);
});

router.post('/admin/leaders/:id/verify', requireImportSecret, async (req, res) => {
  const verified = req.body.verified !== false;
  const result = await communityLeaderService.verifyLeader(req.params.id, {
    verified,
    note: req.body.note,
  });
  if (result.error) return res.status(404).json(result);
  res.json(result);
});

router.get('/reputation/leaderboard', async (req, res) => {
  const rows = await reputationService.getLeaderboard({
    state: req.query.state,
    lga: req.query.lga,
    limit: parseInt(req.query.limit, 10) || 20,
  });
  sendJsonCached(req, res, { leaderboard: rows, badges: reputationService.BADGE_THRESHOLDS });
});

router.get('/reputation/me', requireAuth, async (req, res) => {
  const profile = await reputationService.getPublicProfile(req.user.id);
  res.json({ reputation: profile });
});

router.get('/agents', async (req, res) => {
  const agents = await agentService.listAgents({ state: req.query.state, lga: req.query.lga });
  res.json({ agents });
});

router.post('/agents/register', requireAuth, validate('registerAgent'), async (req, res) => {
  const result = await agentService.registerAgent(req.user.id, req.body);
  res.status(201).json(result);
});

router.post('/agents/help', requireAuth, async (req, res) => {
  const result = await agentService.recordAgentHelp(req.user.id, {
    action: req.body.action || 'setup_circle',
    note: req.body.note,
  });
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

router.get('/schools', async (req, res) => {
  const schools = await schoolSafetyService.listSchools(req.query.state);
  res.json({ schools });
});

router.post('/schools/register', requireAuth, validate('registerSchool'), async (req, res) => {
  const result = await schoolSafetyService.registerSchool(req.user.id, req.body);
  res.status(201).json(result);
});

router.get('/schools/:id/safety', async (req, res) => {
  const result = await schoolSafetyService.getSchoolSafety(req.params.id);
  if (result.error) return res.status(result.status || 404).json({ error: result.error });
  sendJsonCached(req, res, result);
});

router.post('/schools/:id/check-in', requireAuth, validate('schoolCheckIn'), async (req, res) => {
  const result = await schoolSafetyService.schoolCheckIn(req.params.id, {
    ...req.body,
    reported_by: req.user.id,
  });
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  res.json(result);
});

router.get('/partners/zero-rating', (req, res) => {
  res.json({
    status: 'in_discussion',
    message:
      'Free data access for SafeAlert requires a partnership with MTN, Airtel, Glo, or 9Mobile. We pitch this as national public safety infrastructure.',
    info_url: appConfig.zeroRatingInfoUrl || null,
    current_mitigation: ['data_saver_mode', 'ussd', 'sms', 'offline_state_packs', 'whatsapp_bot'],
  });
});

// WhatsApp Cloud API webhook
router.get('/webhooks/whatsapp', (req, res) => {
  const challenge = whatsappService.verifyWebhook(
    req.query['hub.mode'],
    req.query['hub.verify_token'],
    req.query['hub.challenge']
  );
  if (challenge) return res.status(200).send(challenge);
  return res.status(403).send('Forbidden');
});

router.post('/webhooks/whatsapp', async (req, res) => {
  try {
    const result = await whatsappService.processWebhook(req.body);
    res.sendStatus(200);
    if (result.handled && result.reply) {
      logger.info(`[WhatsApp] reply queued for ${result.to}: ${result.reply.slice(0, 60)}…`);
    }
  } catch (err) {
    logger.warn('[WhatsApp] webhook error:', err.message);
    res.sendStatus(200);
  }
});

module.exports = router;
