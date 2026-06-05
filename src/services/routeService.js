const { db } = require('../config/db');
const appConfig = require('../config/appConfig');

const STARTER_ROUTE_SOURCES = new Set(['safealert_starter', 'review_fixture', 'daily_starter']);

function formatRouteWarning(route) {
  const score = route.safety_score ?? 0;
  if (score < appConfig.routeDangerThreshold) {
    const extra =
      score < appConfig.routeDangerThreshold / 2
        ? 'Avoid completely.'
        : 'Use extreme caution.';
    return 'DANGER: Safety score ' + score + '/100. ' + extra;
  }
  if (score < appConfig.routeSafeThreshold) {
    return 'CAUTION: Safety score ' + score + '/100. Stay alert.';
  }
  return 'Route appears safe. Score: ' + score + '/100.';
}

function formatRouteUssd(route) {
  const via = route.via ? `\nVia: ${route.via}` : '';
  const travelers =
    route.ratings_count != null
      ? `\n${route.ratings_count} traveller rating${route.ratings_count !== 1 ? 's' : ''}`
      : route.travelers_last_2h != null
        ? `\n${route.travelers_last_2h} travellers in last 2h`
        : '';
  const verified =
    route.source === 'community' ? '\nCommunity-rated' : '';
  return `${route.from} → ${route.to}${via}\n${formatRouteWarning(route)}${travelers}${verified}`;
}

function isRouteSafe(route) {
  return (route.safety_score ?? 0) >= appConfig.routeSafeThreshold;
}

function normalizeCity(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function routeDocId(from, to) {
  const slug = (s) =>
    normalizeCity(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  return `${slug(from)}_${slug(to)}`;
}

/** Traveller feedback after journey — builds community route scores */
async function recordTravellerFeedback({ from, to, via, safety_rating, userId }) {
  const fromN = normalizeCity(from);
  const toN = normalizeCity(to);
  if (!fromN || !toN || fromN.toLowerCase() === toN.toLowerCase()) {
    return { error: 'from and to must be different cities' };
  }

  const rating = Math.max(1, Math.min(5, parseInt(safety_rating, 10)));
  const newScore = rating * 20;
  const id = routeDocId(fromN, toN);
  const database = db();
  const ref = database.collection('routes').doc(id);
  const snap = await ref.get();

  if (!snap.exists) {
    const doc = {
      id,
      from: fromN,
      to: toN,
      via: (via || '').trim(),
      safety_score: newScore,
      travelers_last_2h: 1,
      ratings_count: 1,
      source: 'community',
      last_updated: new Date().toISOString(),
      last_reported_by: userId || null,
    };
    await ref.set(doc);
    return { created: true, route: doc };
  }

  const r = snap.data();
  if (STARTER_ROUTE_SOURCES.has(r.source)) {
    const doc = {
      id,
      from: fromN,
      to: toN,
      via: (via || r.via || '').trim(),
      safety_score: newScore,
      travelers_last_2h: 1,
      ratings_count: 1,
      source: 'community',
      last_updated: new Date().toISOString(),
      last_reported_by: userId || null,
    };
    await ref.set(doc);
    return { replaced_starter: true, route: doc };
  }

  const n = (r.ratings_count || 0) + 1;
  const blended = Math.round(((r.safety_score || 50) * (n - 1) + newScore) / n);
  const doc = {
    ...r,
    id,
    from: fromN,
    to: toN,
    safety_score: blended,
    travelers_last_2h: n,
    ratings_count: n,
    source: 'community',
    last_updated: new Date().toISOString(),
    last_reported_by: userId || null,
  };
  await ref.set(doc);
  return { updated: true, route: doc };
}

function isBlockedRoute(route) {
  if (!appConfig.blockSimulatedData) return false;
  return STARTER_ROUTE_SOURCES.has(route.source) || route.source === 'import';
}

module.exports = {
  formatRouteWarning,
  formatRouteUssd,
  isRouteSafe,
  recordTravellerFeedback,
  isBlockedRoute,
  normalizeCity,
  routeDocId,
};
