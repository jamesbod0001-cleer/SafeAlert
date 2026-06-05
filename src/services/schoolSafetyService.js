/**
 * School safety — geofenced alerts + check-in for parents/teachers.
 */
const { db } = require('../config/db');
const { distanceKm } = require('../utils/geo');

async function registerSchool(userId, payload) {
  const { name, lat, lng, state, lga, radius_km } = payload;
  const id = `sch_${Date.now().toString(36)}`;
  const doc = {
    id,
    name: name.slice(0, 120),
    lat: parseFloat(lat),
    lng: parseFloat(lng),
    state: (state || '').slice(0, 60),
    lga: (lga || '').slice(0, 60),
    radius_km: Math.min(15, Math.max(1, parseFloat(radius_km) || 5)),
    admin_ids: [userId],
    type: 'school',
    active: true,
    created_at: new Date().toISOString(),
  };
  await db().collection('schools').doc(id).set(doc);
  return { school: doc };
}

async function schoolCheckIn(schoolId, { student_ref, status, reported_by }) {
  const ref = db().collection('schools').doc(schoolId);
  const snap = await ref.get();
  if (!snap.exists) return { error: 'School not found', status: 404 };
  const id = `chk_${schoolId}_${Date.now().toString(36)}`;
  await db().collection('school_checkins').doc(id).set({
    id,
    school_id: schoolId,
    student_ref: (student_ref || 'student').slice(0, 40),
    status: status === 'absent' ? 'absent' : 'arrived',
    reported_by,
    created_at: new Date().toISOString(),
  });
  return { success: true, check_in_id: id };
}

async function getSchoolSafety(schoolId) {
  const snap = await db().collection('schools').doc(schoolId).get();
  if (!snap.exists) return { error: 'School not found', status: 404 };
  const school = snap.data();
  const zoneService = require('./zoneService');
  const candidates = await zoneService.getZones({
    lat: school.lat,
    lng: school.lng,
    radiusKm: school.radius_km,
    state: school.state,
    limit: 80,
  });
  const nearby = candidates
    .map((z) => ({
      ...z,
      distance_km: distanceKm(school.lat, school.lng, z.lat, z.lng),
    }))
    .filter((z) => z.distance_km <= school.radius_km)
    .sort((a, b) => a.distance_km - b.distance_km);
  const critical = nearby.filter((z) => z.severity === 'critical' || z.severity === 'high');
  return {
    school: {
      id: school.id,
      name: school.name,
      state: school.state,
      lga: school.lga,
      radius_km: school.radius_km,
    },
    alerts_within_radius: nearby.length,
    high_risk_count: critical.length,
    zones: nearby.slice(0, 10).map((z) => ({
      id: z.id,
      type: z.type,
      severity: z.severity,
      distance_km: z.distance_km,
    })),
    safe: critical.length === 0,
  };
}

async function listSchools(state) {
  const snap = await db().collection('schools').where('active', '==', true).limit(50).get();
  let schools = snap.docs.map((d) => d.data());
  if (state) {
    schools = schools.filter((s) => (s.state || '').toLowerCase() === state.toLowerCase());
  }
  return schools;
}

module.exports = { registerSchool, schoolCheckIn, getSchoolSafety, listSchools };
