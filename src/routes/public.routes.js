const express = require('express');
const router = express.Router();

const { optionalAuth } = require('../middleware/auth');
const appConfig = require('../config/appConfig');
const { db } = require('../config/db');
const reputationService = require('../services/reputationService');
const { sendJsonCached } = require('../utils/httpCache');
const resourceService = require('../services/resourceService');
const routeService = require('../services/routeService');
const configService = require('../services/configService');
const aiSummaryService = require('../services/aiSummaryService');
const fallbackData = require('../services/fallbackDataService');
const statsCacheService = require('../services/statsCacheService');
const acledService = require('../services/acledService');
const transparencyService = require('../services/transparencyService');
const tipsService = require('../services/tipsService');
const radioService = require('../services/radioService');
const offlinePackService = require('../services/offlinePackService');

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

router.post('/routes/:id/feedback', optionalAuth, async (req, res) => {
  const { safe, note, safety_rating, from: bodyFrom, to: bodyTo } = req.body || {};
  if (typeof safe !== 'boolean' && safety_rating == null) {
    return res.status(400).json({ error: 'safe (boolean) or safety_rating (1-5) required' });
  }
  const rating =
    safety_rating != null
      ? Math.max(1, Math.min(5, parseInt(safety_rating, 10)))
      : safe
        ? 5
        : 1;
  if (!Number.isFinite(rating)) {
    return res.status(400).json({ error: 'safety_rating must be 1-5' });
  }

  const ref = db().collection('routes').doc(req.params.id);
  const snap = await ref.get();
  let from;
  let to;
  if (snap.exists) {
    ({ from, to } = snap.data());
  } else if (bodyFrom && bodyTo && routeService.routeDocId(bodyFrom, bodyTo) === req.params.id) {
    from = bodyFrom;
    to = bodyTo;
  } else {
    return res.status(404).json({ error: 'Route not found' });
  }

  const routeResult = await routeService.recordTravellerFeedback({
    from,
    to,
    safety_rating: rating,
    userId: req.user?.id || null,
  });
  if (routeResult.error) return res.status(400).json(routeResult);

  if (req.user?.id) {
    reputationService
      .addPoints(req.user.id, 'journey_rated', {
        route_id: req.params.id,
        note: note ? String(note).slice(0, 300) : undefined,
      })
      .catch(() => {});
  }

  res.json({
    success: true,
    route: routeResult.route,
    message: 'Thanks — your trip rating helps the community',
  });
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

router.get('/partners/zero-rating', (req, res) => {
  res.json({
    status: 'in_discussion',
    message:
      'Free data access for SafeAlert requires a partnership with MTN, Airtel, Glo, or 9Mobile. We pitch this as national public safety infrastructure.',
    info_url: appConfig.zeroRatingInfoUrl || null,
    current_mitigation: ['data_saver_mode', 'ussd', 'sms', 'offline_state_packs', 'whatsapp_bot'],
  });
});

module.exports = router;
