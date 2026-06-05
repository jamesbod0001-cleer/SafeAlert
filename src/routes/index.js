const express = require('express');
const router = express.Router();

const appConfig = require('../config/appConfig');
const statsCacheService = require('../services/statsCacheService');
const {
  runLiveDataSync,
  getDailyImportStatus,
} = require('../services/scheduledImportService');
const { healthHandler, configPublicHandler } = require('./_helpers');

router.get('/health', healthHandler);
router.get('/config/public', configPublicHandler);

router.use('/auth', require('./auth.routes'));
router.use('/', require('./zones.routes'));
router.use('/', require('./user.routes'));
router.use('/', require('./journey.routes'));
router.use('/', require('./panic.routes'));
router.use('/', require('./checkin.routes'));
router.use('/', require('./community.routes'));
router.use('/', require('./webhooks.routes'));
router.use('/', require('./public.routes'));

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

router.use('/admin', require('./admin.routes'));

module.exports = router;
