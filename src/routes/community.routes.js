const express = require('express');
const router = express.Router();

const { FieldValue } = require('firebase-admin/firestore');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const appConfig = require('../config/appConfig');
const { db } = require('../config/db');
const { isDemoGroup } = require('../constants/demoGroups');
const { LEADER_ROLE_LABELS } = require('../constants/communityRoles');
const { sendJsonCached } = require('../utils/httpCache');
const zoneService = require('../services/zoneService');
const estateService = require('../services/estateService');
const communityLeaderService = require('../services/communityLeaderService');
const reputationService = require('../services/reputationService');
const agentService = require('../services/agentService');
const schoolSafetyService = require('../services/schoolSafetyService');
const fallbackData = require('../services/fallbackDataService');

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

module.exports = router;
