/**
 * Verified community leaders — borrow existing local trust.
 */
const { db } = require('../config/db');
const { LEADER_ROLES } = require('../constants/communityRoles');
const reputationService = require('./reputationService');
const zoneService = require('./zoneService');
const logger = require('../utils/logger');

async function applyForLeader(userId, payload) {
  const { role, org_name, state, lga, ward, phone } = payload;
  if (!LEADER_ROLES.includes(role)) {
    return { error: 'Invalid leader role' };
  }
  const id = `ldr_${userId}`;
  const doc = {
    id,
    user_id: userId,
    role,
    org_name: (org_name || '').slice(0, 120),
    state: (state || '').slice(0, 60),
    lga: (lga || '').slice(0, 60),
    ward: (ward || '').slice(0, 60),
    phone: (phone || '').slice(0, 20),
    status: 'pending',
    verified: false,
    endorsements: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await db().collection('community_leaders').doc(id).set(doc, { merge: true });
  return { leader: doc, message: 'Application received — verification may take 1–3 days' };
}

async function verifyLeader(leaderId, { verified = true, note = '' }) {
  const ref = db().collection('community_leaders').doc(leaderId);
  const snap = await ref.get();
  if (!snap.exists) return { error: 'Leader not found' };
  await ref.update({
    status: verified ? 'verified' : 'rejected',
    verified,
    verified_at: verified ? new Date().toISOString() : null,
    verification_note: (note || '').slice(0, 300),
    updated_at: new Date().toISOString(),
  });
  if (verified) {
    const leader = snap.data();
    await db().collection('users').doc(leader.user_id).update({
      is_community_leader: true,
      leader_role: leader.role,
      leader_id: leaderId,
    });
  }
  return { success: true };
}

async function listLeaders({ state, verifiedOnly = true }) {
  const snap = await db().collection('community_leaders').limit(80).get();
  let leaders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (verifiedOnly) leaders = leaders.filter((l) => l.verified && l.status === 'verified');
  if (state) {
    leaders = leaders.filter(
      (l) => (l.state || '').toLowerCase().replace(/\s+state$/i, '') === state.toLowerCase()
    );
  }
  return leaders;
}

async function getLeaderForUser(userId) {
  const snap = await db()
    .collection('community_leaders')
    .where('user_id', '==', userId)
    .where('verified', '==', true)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

/** Leader endorsement counts as strong community signal */
async function leaderEndorseZone(userId, zoneId) {
  const leader = await getLeaderForUser(userId);
  if (!leader) return { error: 'Not a verified community leader', status: 403 };

  const zone = await zoneService.getZoneById(zoneId);
  if (!zone || !zone.active) return { error: 'Zone not found', status: 404 };

  const newVotes = (zone.votes_danger || 0) + 2;
  const updates = {
    votes_danger: newVotes,
    reports: (zone.reports || 0) + 1,
    verified: true,
    leader_endorsed: true,
    leader_id: leader.id,
    leader_role: leader.role,
    updated_at: new Date().toISOString(),
  };
  await db().collection('zones').doc(zoneId).update(updates);
  await db().collection('leader_endorsements').add({
    leader_id: leader.id,
    zone_id: zoneId,
    user_id: userId,
    created_at: new Date().toISOString(),
  });
  await reputationService.addPoints(userId, 'leader_endorse', { zone_id: zoneId });
  logger.info(`Leader ${leader.id} endorsed zone ${zoneId}`);
  return { zone: { ...zone, ...updates }, message: 'Alert endorsed by verified community leader' };
}

module.exports = {
  applyForLeader,
  verifyLeader,
  listLeaders,
  getLeaderForUser,
  leaderEndorseZone,
};
