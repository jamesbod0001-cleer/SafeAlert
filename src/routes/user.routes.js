const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { locationLimiter } = require('../middleware/rateLimiter');
const authService = require('../services/authService');
const appConfig = require('../config/appConfig');
const { db } = require('../config/db');
const locationService = require('../services/locationService');
const responderService = require('../services/responderService');
const fallbackData = require('../services/fallbackDataService');
const { hashAnonymous, encryptContact, decryptContact } = require('../utils/crypto');

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
  if (!token || typeof token !== 'string') return res.status(400).json({ error: 'Token required' });
  if (token.length > 512) return res.status(400).json({ error: 'Token too long' });
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
  if (req.body.women_prefer_female_helpers !== undefined) {
    prefPatch.women_prefer_female_helpers = req.body.women_prefer_female_helpers;
  }
  if (req.body.women_checkin_nudge !== undefined) prefPatch.women_checkin_nudge = req.body.women_checkin_nudge;
  if (req.body.women_responder_opt_in !== undefined) {
    prefPatch.women_responder_opt_in = req.body.women_responder_opt_in;
  }
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

router.get('/user/medical-ice', requireAuth, async (req, res) => {
  res.json({ medical_ice: req.user.medical_ice || {} });
});

router.put('/user/medical-ice', requireAuth, validate('updateMedicalIce'), async (req, res) => {
  const medical_ice = {
    blood_group: (req.body.blood_group || '').trim().slice(0, 10),
    allergies: (req.body.allergies || '').trim().slice(0, 500),
    conditions: (req.body.conditions || '').trim().slice(0, 500),
    ice_name: (req.body.ice_name || '').trim().slice(0, 80),
    ice_phone: (req.body.ice_phone || '').trim().slice(0, 20),
    updated_at: new Date().toISOString(),
  };
  await db().collection('users').doc(req.user.id).update({ medical_ice });
  res.json({ success: true, medical_ice });
});

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

module.exports = router;
