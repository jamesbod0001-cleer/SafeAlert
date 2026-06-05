/**
 * Community reputation — social currency, not cash bounties.
 */
const { FieldValue } = require('firebase-admin/firestore');
const { db } = require('../config/db');

const POINTS = {
  report_created: 2,
  report_confirmed: 5,
  report_cleared: 3,
  false_report_flagged: -8,
  leader_endorse: 10,
  journey_rated: 1,
};

const BADGE_THRESHOLDS = [
  { id: 'trusted_reporter', min: 25, label: 'Trusted Reporter' },
  { id: 'village_guardian', min: 75, label: 'Village Guardian' },
  { id: 'state_champion', min: 200, label: 'State Safety Champion' },
];

async function ensureUserRep(userId) {
  const ref = db().collection('users').doc(userId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const u = snap.data();
  if (u.reporter_score != null) return u;
  await ref.update({
    reporter_score: 0,
    reports_submitted: 0,
    reports_confirmed: 0,
    reputation_badges: [],
    reputation_updated_at: new Date().toISOString(),
  });
  return { ...u, reporter_score: 0, reports_submitted: 0, reports_confirmed: 0, reputation_badges: [] };
}

function badgesForScore(score) {
  return BADGE_THRESHOLDS.filter((b) => score >= b.min).map((b) => b.id);
}

async function addPoints(userId, action, meta = {}) {
  const delta = POINTS[action];
  if (!delta) return { skipped: true };
  await ensureUserRep(userId);
  const ref = db().collection('users').doc(userId);
  const snap = await ref.get();
  if (!snap.exists) return { error: 'User not found' };
  const prev = snap.data().reporter_score || 0;
  const next = Math.max(0, prev + delta);
  const updates = {
    reporter_score: next,
    reputation_badges: badgesForScore(next),
    reputation_updated_at: new Date().toISOString(),
  };
  if (action === 'report_created') {
    updates.reports_submitted = FieldValue.increment(1);
  }
  if (action === 'report_confirmed' || action === 'leader_endorse') {
    updates.reports_confirmed = FieldValue.increment(1);
  }
  await ref.update(updates);
  await db().collection('reputation_events').add({
    user_id: userId,
    action,
    delta,
    meta,
    created_at: new Date().toISOString(),
  });
  return { score: next, badges: badgesForScore(next), delta };
}

async function getLeaderboard({ state, lga, limit = 20 }) {
  const snap = await db().collection('users').orderBy('reporter_score', 'desc').limit(100).get();
  let rows = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((u) => (u.reporter_score || 0) > 0);
  if (state) {
    rows = rows.filter((u) => (u.home_state || u.state || '').toLowerCase() === state.toLowerCase());
  }
  if (lga) {
    rows = rows.filter((u) => (u.home_lga || u.lga || '').toLowerCase() === lga.toLowerCase());
  }
  return rows.slice(0, limit).map((u, i) => ({
    rank: i + 1,
    display_name: u.display_name || u.name || `Reporter ${u.id.slice(0, 6)}`,
    score: u.reporter_score || 0,
    badges: u.reputation_badges || [],
    state: u.home_state || u.state || '',
    lga: u.home_lga || u.lga || '',
  }));
}

async function getPublicProfile(userId) {
  const snap = await db().collection('users').doc(userId).get();
  if (!snap.exists) return null;
  const u = snap.data();
  return {
    id: userId,
    display_name: u.display_name || u.name || 'Community member',
    score: u.reporter_score || 0,
    reports_submitted: u.reports_submitted || 0,
    reports_confirmed: u.reports_confirmed || 0,
    badges: (u.reputation_badges || []).map((id) => {
      const b = BADGE_THRESHOLDS.find((x) => x.id === id);
      return b ? { id, label: b.label } : { id, label: id };
    }),
  };
}

module.exports = {
  POINTS,
  BADGE_THRESHOLDS,
  addPoints,
  getLeaderboard,
  getPublicProfile,
  badgesForScore,
};
