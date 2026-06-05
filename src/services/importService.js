/**
 * Bulk import zones, routes, resources, groups into Firestore.
 */
const fs = require('fs');
const path = require('path');
const { randomUUID: uuidv4 } = require('crypto');
const { db } = require('../config/db');
const { guessState } = require('../utils/geo');
const { hashAnonymous } = require('../utils/crypto');
const appConfig = require('../config/appConfig');

const SEVERITY_THRESHOLDS = appConfig.severityThresholds;

function calcSeverity(votesDanger) {
  if (votesDanger >= SEVERITY_THRESHOLDS.critical) return 'critical';
  if (votesDanger >= SEVERITY_THRESHOLDS.high) return 'high';
  if (votesDanger >= SEVERITY_THRESHOLDS.medium) return 'medium';
  return 'low';
}

function mapAcledType(eventType, subEvent) {
  const t = `${eventType || ''} ${subEvent || ''}`.toLowerCase();
  if (t.includes('protest') || t.includes('riot')) return 'protest';
  if (t.includes('explos') || t.includes('remote') || t.includes('bomb')) return 'terror';
  if (t.includes('battle') || t.includes('armed clash')) return 'banditry';
  if (t.includes('kidnap') || t.includes('abduction')) return 'kidnapping';
  if (t.includes('robbery') || t.includes('violence against civilians')) return 'armed_robbery';
  if (t.includes('road') || t.includes('block')) return 'roadblock';
  return 'suspicious';
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (!cols.length) continue;
    const row = {};
    headers.forEach((h, j) => {
      row[h] = (cols[j] || '').trim();
    });
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQ = !inQ;
      continue;
    }
    if (c === ',' && !inQ) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

function normalizeZoneInput(z, defaults = {}) {
  const lat = parseFloat(z.lat ?? z.latitude);
  const lng = parseFloat(z.lng ?? z.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const type = z.type || defaults.type || 'suspicious';
  const state = z.state || guessState(lat, lng);
  const reports = parseInt(z.reports, 10) || parseInt(z.votes_danger, 10) || 1;
  const votesDanger = parseInt(z.votes_danger, 10) || reports;
  const votesCleared = parseInt(z.votes_cleared, 10) || 0;
  const severity = z.severity || calcSeverity(votesDanger);
  const created = z.created_at || z.event_date || z.event_date_col || new Date().toISOString();
  const deviceId = z.device_id || z.source || 'import-pipeline';
  const active =
    z.active !== undefined
      ? !!z.active
      : defaults.historicalInactive
        ? false
        : true;

  return {
    id: z.id || `imp_${uuidv4()}`,
    lat,
    lng,
    type,
    state,
    lga: z.lga || z.admin2 || '',
    label: z.label || `${type.replace(/_/g, ' ')} — ${state}`,
    description: (z.description || z.notes || z.location || '').slice(0, 500),
    severity,
    reports,
    votes_danger: votesDanger,
    votes_cleared: votesCleared,
    verified: z.verified !== undefined ? !!z.verified : votesDanger >= 3,
    active,
    source: z.source || defaults.source || 'import',
    external_id: z.external_id || z.data_id || z.event_id || null,
    reporter_hash: hashAnonymous(deviceId),
    confirmed_by: [hashAnonymous(deviceId)],
    created_at: typeof created === 'string' ? created : new Date(created).toISOString(),
    updated_at: new Date().toISOString(),
    expires_at:
      z.expires_at ||
      new Date(Date.now() + (active ? 7 : 1) * 24 * 3600 * 1000).toISOString(),
  };
}

async function upsertZone(zone, { skipExisting, dryRun }) {
  const database = db();
  if (skipExisting && zone.external_id) {
    const q = await database
      .collection('zones')
      .where('external_id', '==', zone.external_id)
      .limit(1)
      .get();
    if (!q.empty) return { status: 'skipped', id: q.docs[0].id };
  }
  if (skipExisting) {
    const ex = await database.collection('zones').doc(zone.id).get();
    if (ex.exists) return { status: 'skipped', id: zone.id };
  }
  if (dryRun) return { status: 'dry', id: zone.id };
  await database.collection('zones').doc(zone.id).set(zone);
  return { status: 'imported', id: zone.id };
}

async function upsertRoute(route, { skipExisting, dryRun, refreshRoutes }) {
  if (!route.from || !route.to) return { status: 'invalid' };
  const id =
    route.id ||
    `${route.from.toLowerCase().replace(/\s/g, '_')}_${route.to.toLowerCase().replace(/\s/g, '_')}`;
  const database = db();
  const existed = (await database.collection('routes').doc(id).get()).exists;
  if (skipExisting && existed && !refreshRoutes) {
    return { status: 'skipped', id };
  }
  const doc = {
    id,
    from: route.from,
    to: route.to,
    via: route.via || '',
    safety_score: route.safety_score ?? 50,
    travelers_last_2h: route.travelers_last_2h ?? 0,
    last_updated: new Date().toISOString(),
    source: route.source || 'import',
  };
  if (dryRun) return { status: existed ? 'dry_update' : 'dry', id };
  await database.collection('routes').doc(id).set(doc, { merge: refreshRoutes && existed });
  return { status: existed ? 'updated' : 'imported', id };
}

async function upsertResource(item, { skipExisting, dryRun }) {
  const id = item.id || `res_${uuidv4()}`;
  const database = db();
  if (skipExisting) {
    const ex = await database.collection('resources').doc(id).get();
    if (ex.exists) return { status: 'skipped', id };
  }
  if (dryRun) return { status: 'dry', id };
  await database.collection('resources').doc(id).set({
    ...item,
    id,
    active: item.active !== false,
    created_at: item.created_at || new Date().toISOString(),
  });
  return { status: 'imported', id };
}

async function upsertGroup(group, { skipExisting, dryRun }) {
  const id = group.id || `grp_${uuidv4()}`;
  const database = db();
  if (skipExisting) {
    const ex = await database.collection('groups').doc(id).get();
    if (ex.exists) return { status: 'skipped', id };
  }
  if (dryRun) return { status: 'dry', id };
  await database.collection('groups').doc(id).set({ ...group, id });
  return { status: 'imported', id };
}

function acledRowsToZones(rows, { historicalInactive, source }) {
  const zones = [];
  for (const row of rows) {
    const lat = parseFloat(row.latitude || row.lat);
    const lng = parseFloat(row.longitude || row.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < 4 || lat > 14 || lng < 2.7 || lng > 15) continue;

    const fatalities = parseInt(row.fatalities, 10) || 0;
    let votes = 2;
    if (fatalities >= 10) votes = 8;
    else if (fatalities >= 3) votes = 6;
    else if (fatalities >= 1) votes = 4;

    const eventDate = row.event_date || row.event_date_col || row.event_date_dmy;
    const eventType = row.event_type || '';
    const subEvent = row.sub_event_type || '';
    const z = normalizeZoneInput(
      {
        lat,
        lng,
        type: mapAcledType(eventType, subEvent),
        description: [eventType, subEvent, row.location, row.admin1, row.notes, row.tags]
          .filter(Boolean)
          .join(' — '),
        state: row.admin1,
        lga: row.admin2,
        event_date: eventDate ? parseAcledDate(eventDate) : undefined,
        source: source || 'acled',
        external_id: row.data_id || row.event_id_cnty || row.event_id || `${eventDate}_${lat}_${lng}`,
        votes_danger: votes,
        reports: votes,
        verified: fatalities > 0 || votes >= 3,
        active: !historicalInactive,
      },
      { source: 'acled', historicalInactive }
    );
    if (z) zones.push(z);
  }
  return zones;
}

function parseAcledDate(s) {
  const raw = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return new Date(raw).toISOString();
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`).toISOString();
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

async function importBundle(bundle, opts) {
  const summary = { zones: {}, routes: {}, resources: {}, groups: {} };
  const tally = (bucket, r) => {
    summary[bucket][r.status] = (summary[bucket][r.status] || 0) + 1;
  };

  for (const z of bundle.zones || []) {
    const norm = normalizeZoneInput(z, opts);
    if (!norm) continue;
    tally('zones', await upsertZone(norm, opts));
  }
  for (const r of bundle.routes || []) {
    tally('routes', await upsertRoute(r, opts));
  }
  for (const r of bundle.resources || []) {
    tally('resources', await upsertResource(r, opts));
  }
  for (const g of bundle.groups || []) {
    tally('groups', await upsertGroup(g, opts));
  }
  if (!opts.dryRun && (bundle.zones || []).length) {
    try {
      const statsCacheService = require('./statsCacheService');
      statsCacheService.scheduleRefresh(5000);
    } catch {
      /* ignore */
    }
  }
  return summary;
}

function loadJsonFile(filePath) {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

module.exports = {
  importBundle,
  loadJsonFile,
  parseCsv,
  acledRowsToZones,
  mapAcledType,
  normalizeZoneInput,
  upsertZone,
  upsertRoute,
};
