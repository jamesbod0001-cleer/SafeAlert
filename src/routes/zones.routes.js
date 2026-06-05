const express = require('express');
const router = express.Router();

const { optionalAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { guessState } = require('../utils/geo');
const zoneService = require('../services/zoneService');
const reputationService = require('../services/reputationService');
const proximityNotifyService = require('../services/proximityNotifyService');
const fallbackData = require('../services/fallbackDataService');
const { sendJsonCached } = require('../utils/httpCache');

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
  const state = zoneService.normState(guessState(lat, lng));
  const zonesBefore = await zoneService.countActiveZonesInState(state);
  const zone = await zoneService.createZone({ lat, lng, type, description, deviceId: device_id });
  if (req.user?.id) {
    reputationService.addPoints(req.user.id, 'report_created', { zone_id: zone.id }).catch(() => {});
  }

  let firstInState = false;
  if (zonesBefore === 0 && req.user?.id) {
    const award = await reputationService.awardFirstStateReport(req.user.id, state);
    firstInState = !award.skipped && !award.already;
  }

  proximityNotifyService.enqueueZoneCreatedNotify(zone);

  const payload = { zone, message: 'Alert submitted — nearby users will be notified' };
  if (firstInState) {
    payload.first_in_state = true;
    payload.message = `First reporter in ${state}! Community alerted.`;
  }
  res.status(201).json(payload);
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

module.exports = router;
