/**
 * Live incident sync from ACLED (https://acleddata.com).
 * Auth: OAuth email+password (recommended) or legacy key+email.
 */
const appConfig = require('../config/appConfig');
const { importBundle, acledRowsToZones } = require('./importService');
const logger = require('../utils/logger');

const ACLED_OAUTH = 'https://acleddata.com/oauth/token';
const ACLED_READ = 'https://acleddata.com/api/acled/read';
const ACLED_LEGACY = 'https://api.acleddata.com/acled/read';

let cachedToken = null;
let tokenExpiresAt = 0;

function daysAgoIso(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isConfigured() {
  return !!(
    appConfig.acledEmail &&
    (appConfig.acledPassword || appConfig.acledApiKey)
  );
}

async function getOAuthToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedToken;
  }
  if (!appConfig.acledEmail || !appConfig.acledPassword) {
    return null;
  }

  const body = new URLSearchParams({
    username: appConfig.acledEmail,
    password: appConfig.acledPassword,
    grant_type: 'password',
    client_id: 'acled',
    scope: 'authenticated',
  });

  const res = await fetch(ACLED_OAUTH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(60000),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`ACLED OAuth failed (${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok || !data.access_token) {
    throw new Error(
      data.error_description || data.message || data.error || `ACLED login failed (${res.status})`
    );
  }

  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in || 86400) * 1000;
  logger.info('[ACLED] OAuth token obtained');
  return cachedToken;
}

async function fetchPageOAuth({ start, end, page, limit }) {
  const token = await getOAuthToken();
  const params = new URLSearchParams({
    _format: 'json',
    country: 'Nigeria',
    event_date: `${start}|${end}`,
    event_date_where: 'BETWEEN',
    limit: String(limit),
    page: String(page),
  });

  const res = await fetch(`${ACLED_READ}?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(120000),
  });

  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`ACLED read non-JSON (${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    const msg = body.message || body.error || `ACLED read failed (${res.status})`;
    if (res.status === 403) {
      throw new Error(
        `${msg} — your myACLED account can sign in but lacks API data access. Request access at https://acleddata.com or run: npm run sync:hdx`
      );
    }
    throw new Error(msg);
  }

  const events = Array.isArray(body.data) ? body.data : [];
  return { events, count: body.count ?? events.length, status: body.status };
}

async function fetchPageLegacy({ start, end, page, limit }) {
  const params = new URLSearchParams({
    key: appConfig.acledApiKey,
    email: appConfig.acledEmail,
    country: 'Nigeria',
    event_date: `${start}|${end}`,
    event_date_where: 'BETWEEN',
    limit: String(limit),
    page: String(page),
  });

  const res = await fetch(`${ACLED_LEGACY}?${params.toString()}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(120000),
  });

  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`ACLED legacy non-JSON (${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    throw new Error(body.error || body.message || `ACLED legacy failed (${res.status})`);
  }

  const events = Array.isArray(body.data) ? body.data : [];
  return { events, count: body.count ?? events.length };
}

/**
 * Fetch all Nigeria events in date range with pagination.
 */
async function fetchNigeriaEvents({ days = 30, limit = 5000, maxPages = 20 } = {}) {
  if (!isConfigured()) {
    return {
      error:
        'ACLED not configured — set ACLED_EMAIL + ACLED_PASSWORD in .env (register at acleddata.com)',
      events: [],
    };
  }

  const start = daysAgoIso(days);
  const end = todayIso();
  const pageSize = Math.min(limit, 5000);
  const allEvents = [];
  const useOAuth = !!appConfig.acledPassword;

  for (let page = 1; page <= maxPages; page++) {
    const result = useOAuth
      ? await fetchPageOAuth({ start, end, page, limit: pageSize })
      : await fetchPageLegacy({ start, end, page, limit: pageSize });

    if (!result.events.length) break;
    allEvents.push(...result.events);
    logger.info(`[ACLED] Page ${page}: ${result.events.length} events (total ${allEvents.length})`);

    if (result.events.length < pageSize) break;
    if (allEvents.length >= limit) {
      allEvents.splice(limit);
      break;
    }
  }

  return {
    events: allEvents,
    count: allEvents.length,
    date_range: { start, end },
    auth: useOAuth ? 'oauth' : 'legacy_key',
  };
}

async function syncLiveFromAcled(opts = {}) {
  const days = opts.days ?? appConfig.acledLookbackDays;
  const limit = opts.limit ?? appConfig.acledSyncLimit;
  const dryRun = !!opts.dryRun;

  const { events, error, date_range, auth } = await fetchNigeriaEvents({ days, limit });
  if (error) return { error, imported: 0 };
  if (!events.length) {
    return {
      message: 'ACLED returned 0 Nigeria events for date range',
      imported: 0,
      fetched: 0,
      date_range,
    };
  }

  const rows = events.map((e) => ({
    latitude: e.latitude,
    longitude: e.longitude,
    event_type: e.event_type,
    sub_event_type: e.sub_event_type,
    event_date: e.event_date,
    location: e.location,
    admin1: e.admin1,
    admin2: e.admin2,
    notes: e.notes,
    fatalities: e.fatalities,
    event_id_cnty: e.event_id_cnty,
    data_id: e.event_id_cnty,
    country: e.country,
  }));

  const zones = acledRowsToZones(rows, { historicalInactive: false, source: 'acled' });
  const summary = await importBundle({ zones }, { skipExisting: true, dryRun, source: 'acled' });

  return {
    fetched: events.length,
    zones_mapped: zones.length,
    summary,
    source: 'acled_live',
    auth,
    date_range,
  };
}

module.exports = {
  isConfigured,
  fetchNigeriaEvents,
  syncLiveFromAcled,
  getOAuthToken,
};
