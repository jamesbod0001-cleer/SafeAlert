/**
 * Verified conflict data from HDX (UCDP Nigeria) — no ACLED API tier required.
 * Source: https://data.humdata.org (UCDP / Uppsala University)
 */
const appConfig = require('../config/appConfig');
const { parseCsv, acledRowsToZones, importBundle } = require('./importService');
const logger = require('../utils/logger');

const DEFAULT_UCDP_URL =
  'https://data.humdata.org/dataset/a2260243-108d-4df4-a7e6-a010bcbb553f/resource/9e2fcefc-24ab-4903-88fd-fa089c8edc2b/download/conflict_data_nga.csv';

function daysAgoDate(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

function mapUcdpEventType(typeOfViolence) {
  const t = String(typeOfViolence || '').trim();
  if (t === '3') return 'Violence against civilians';
  if (t === '2') return 'Armed clash';
  if (t === '1') return 'Battle';
  return 'Armed clash';
}

function ucdpRowToAcledShape(row) {
  const lat = parseFloat(row.latitude);
  const lng = parseFloat(row.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const fatalities =
    parseInt(row.best, 10) ||
    parseInt(row.deaths_civilians, 10) ||
    parseInt(row.deaths_a, 10) ||
    parseInt(row.deaths_b, 10) ||
    0;

  const eventDate = (row.date_start || row.date_end || '').slice(0, 10);
  if (!eventDate) return null;

  return {
    latitude: lat,
    longitude: lng,
    event_type: mapUcdpEventType(row.type_of_violence),
    sub_event_type: row.dyad_name || row.conflict_name || '',
    event_date: eventDate,
    location: row.where_description || row.where_prec || '',
    admin1: row.adm_1 || '',
    admin2: row.adm_2 || '',
    notes: row.source_headline || row.source_original || '',
    fatalities,
    event_id_cnty: `ucdp_${row.id}`,
    country: row.country || 'Nigeria',
  };
}

async function fetchUcdpCsv(url = appConfig.hdxUcdpUrl || DEFAULT_UCDP_URL) {
  const res = await fetch(url, { signal: AbortSignal.timeout(180000) });
  if (!res.ok) {
    throw new Error(`HDX UCDP download failed (${res.status})`);
  }
  return res.text();
}

function filterRowsByLookback(rows, days) {
  const cutoff = daysAgoDate(days);
  return rows.filter((row) => {
    const raw = (row.date_start || row.date_end || '').slice(0, 10);
    if (!raw) return false;
    const d = new Date(raw);
    return !Number.isNaN(d.getTime()) && d >= cutoff;
  });
}

async function syncFromUcdp(opts = {}) {
  const days = opts.days ?? appConfig.hdxUcdpLookbackDays;
  const limit = opts.limit ?? appConfig.hdxUcdpSyncLimit;
  const dryRun = !!opts.dryRun;
  const url = opts.url ?? (appConfig.hdxUcdpUrl || DEFAULT_UCDP_URL);

  logger.info(`[HDX] Downloading UCDP Nigeria CSV (lookback ${days} days)...`);
  const text = await fetchUcdpCsv(url);
  const rows = parseCsv(text);
  const recent = filterRowsByLookback(rows, days);
  logger.info(`[HDX] UCDP rows: ${rows.length} total, ${recent.length} in lookback window`);

  const mapped = [];
  for (const row of recent) {
    const shape = ucdpRowToAcledShape(row);
    if (shape) mapped.push(shape);
    if (mapped.length >= limit) break;
  }

  if (!mapped.length) {
    return {
      message: 'No UCDP events with coordinates in lookback window — try increasing HDX_UCDP_LOOKBACK_DAYS',
      imported: 0,
      fetched: 0,
      source: 'hdx_ucdp',
    };
  }

  const zones = acledRowsToZones(mapped, { historicalInactive: false, source: 'ucdp' });
  const summary = await importBundle({ zones }, { skipExisting: true, dryRun, source: 'ucdp' });

  return {
    fetched: mapped.length,
    zones_mapped: zones.length,
    summary,
    source: 'hdx_ucdp',
    dataset_url: url,
    lookback_days: days,
  };
}

function isEnabled() {
  return appConfig.hdxUcdpEnabled;
}

module.exports = {
  isEnabled,
  syncFromUcdp,
  fetchUcdpCsv,
  filterRowsByLookback,
  ucdpRowToAcledShape,
  DEFAULT_UCDP_URL,
};
