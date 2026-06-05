const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { db } = require('../config/db');
const routeService = require('../services/routeService');
const convoyService = require('../services/convoyService');

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

module.exports = router;
