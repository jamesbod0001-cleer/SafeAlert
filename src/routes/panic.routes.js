const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { panicLimiter } = require('../middleware/rateLimiter');
const appConfig = require('../config/appConfig');
const { db } = require('../config/db');
const panicService = require('../services/panicService');
const notifyJobsService = require('../services/notifyJobsService');
const locationService = require('../services/locationService');
const fallbackData = require('../services/fallbackDataService');
const logger = require('../utils/logger');

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

  const { circlePhones } = await panicService.getCirclePhonesAndTokens(updatedUser);

  await notifyJobsService.enqueueJob('panic-notify', {
    eventId: event.id,
    userId: user.id,
    lat,
    lng,
    message: req.body.message,
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

  notifyJobsService.enqueueJob('panic-broadcast', {
    lat,
    lng,
    userId: req.user.id,
    panicId,
    message: req.body.message,
  }).catch((err) => {
    logger.error('Panic broadcast enqueue failed:', err.message);
  });

  res.status(202).json({ success: true, message: 'Broadcast queued', notifications_async: true });
});

module.exports = router;
