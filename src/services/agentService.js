/**
 * Field agent network — POS-style safety helpers (airtime rewards, not cash).
 */
const { db } = require('../config/db');

async function registerAgent(userId, payload) {
  const { display_name, state, lga, ward, phone, can_read_aloud } = payload;
  const id = `agent_${userId}`;
  const doc = {
    id,
    user_id: userId,
    display_name: (display_name || 'Field agent').slice(0, 80),
    state: (state || '').slice(0, 60),
    lga: (lga || '').slice(0, 60),
    ward: (ward || '').slice(0, 60),
    phone: (phone || '').slice(0, 20),
    can_read_aloud: !!can_read_aloud,
    status: 'active',
    setups_helped: 0,
    airtime_rewards_ngn: 0,
    verified: false,
    created_at: new Date().toISOString(),
  };
  await db().collection('field_agents').doc(id).set(doc, { merge: true });
  await db().collection('users').doc(userId).update({ is_field_agent: true, agent_id: id });
  return { agent: doc };
}

async function listAgents({ state, lga, limit = 30 }) {
  const snap = await db()
    .collection('field_agents')
    .where('status', '==', 'active')
    .limit(200)
    .get();
  let agents = snap.docs.map((d) => d.data());
  if (state) {
    agents = agents.filter((a) => (a.state || '').toLowerCase() === state.toLowerCase());
  }
  if (lga) {
    agents = agents.filter((a) => (a.lga || '').toLowerCase() === lga.toLowerCase());
  }
  return agents.slice(0, limit).map((a) => ({
    id: a.id,
    display_name: a.display_name,
    state: a.state,
    lga: a.lga,
    ward: a.ward,
    can_read_aloud: a.can_read_aloud,
    setups_helped: a.setups_helped || 0,
  }));
}

async function recordAgentHelp(agentUserId, { action, note }) {
  const id = `agent_${agentUserId}`;
  const ref = db().collection('field_agents').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { error: 'Not registered as agent' };
  const updates = { updated_at: new Date().toISOString() };
  if (action === 'setup_circle') {
    updates.setups_helped = (snap.data().setups_helped || 0) + 1;
    updates.airtime_rewards_ngn = (snap.data().airtime_rewards_ngn || 0) + 50;
  }
  await ref.update(updates);
  await db().collection('agent_activity').add({
    agent_id: id,
    action,
    note: (note || '').slice(0, 200),
    created_at: new Date().toISOString(),
  });
  return { success: true, message: 'Activity logged — airtime rewards processed weekly' };
}

module.exports = { registerAgent, listAgents, recordAgentHelp };
