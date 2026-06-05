const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const checkInService = require('../services/checkInService');

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

module.exports = router;
