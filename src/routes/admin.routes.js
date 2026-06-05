const express = require('express');
const router = express.Router();

const { requireAdminSecret } = require('../middleware/adminAuth');
const { db } = require('../config/db');
const appConfig = require('../config/appConfig');
const communityLeaderService = require('../services/communityLeaderService');

router.use(requireAdminSecret);

router.get('/leaders/pending', async (req, res) => {
  const snap = await db()
    .collection('community_leaders')
    .where('status', '==', 'pending')
    .limit(100)
    .get();
  const leaders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  res.json({ leaders });
});

router.post('/leaders/:id/verify', async (req, res) => {
  const verified = req.body.verified !== false;
  const result = await communityLeaderService.verifyLeader(req.params.id, {
    verified,
    note: req.body.note,
  });
  if (result.error) return res.status(404).json(result);
  res.json(result);
});

router.get('/false-reports', async (req, res) => {
  const snap = await db()
    .collection('zone_flags')
    .orderBy('created_at', 'desc')
    .limit(50)
    .get();
  const flags = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      zone_id: data.zone_id,
      reason: data.reason,
      device_hash: data.device_hash,
      created_at: data.created_at,
    };
  });
  res.json({ flags });
});

router.get('/settings', async (req, res) => {
  const snap = await db().collection('app_settings').doc('global').get();
  const data = snap.exists ? snap.data() : {};
  res.json({
    proximity_alerts_enabled:
      data.proximity_alerts_enabled ?? appConfig.proximityAlertsEnabled,
    push_notifications_enabled:
      data.push_notifications_enabled ?? appConfig.pushNotificationsEnabled,
  });
});

router.put('/settings/proximity', async (req, res) => {
  const enabled = !!req.body.enabled;
  await db()
    .collection('app_settings')
    .doc('global')
    .set(
      {
        proximity_alerts_enabled: enabled,
        updated_at: new Date().toISOString(),
      },
      { merge: true }
    );
  res.json({
    ok: true,
    proximity_alerts_enabled: enabled,
    note:
      'PROXIMITY_ALERTS_ENABLED env var takes precedence on server restart; app_settings is the runtime emergency kill switch.',
  });
});

module.exports = router;
