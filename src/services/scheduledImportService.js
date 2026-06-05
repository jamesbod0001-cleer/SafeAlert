/**
 * Scheduled live data sync — ACLED when configured; never re-loads simulated starter pack.
 */
const acledService = require('./acledService');
const hdxImportService = require('./hdxImportService');
const logger = require('../utils/logger');
const appConfig = require('../config/appConfig');

function isAcledAccessDenied(err) {
  const msg = String(err?.message || err || '');
  return /access denied|403/i.test(msg);
}

let running = false;
let lastRunAt = null;
let lastSummary = null;
let lastError = null;

async function runLiveDataSync() {
  if (running) {
    logger.warn('[LiveSync] Skipped — previous run in progress');
    return { skipped: true };
  }
  running = true;
  const started = Date.now();
  try {
    if (!acledService.isConfigured() && !hdxImportService.isEnabled()) {
      const msg =
        'No live data source — set ACLED_EMAIL + ACLED_PASSWORD or keep HDX_UCDP_ENABLED=true';
      lastError = msg;
      logger.warn(`[LiveSync] ${msg}`);
      return { error: msg, configured: false };
    }

    let result;
    let source = 'acled';

    if (acledService.isConfigured()) {
      try {
        result = await acledService.syncLiveFromAcled({
          days: appConfig.acledLookbackDays,
          limit: appConfig.acledSyncLimit,
        });
        if (result.error) throw new Error(result.error);
      } catch (err) {
        if (!isAcledAccessDenied(err) || !hdxImportService.isEnabled()) throw err;
        logger.warn(`[LiveSync] ACLED unavailable (${err.message}) — using HDX UCDP`);
        source = 'hdx_ucdp_fallback';
        result = await hdxImportService.syncFromUcdp({
          days: appConfig.hdxUcdpLookbackDays,
          limit: appConfig.hdxUcdpSyncLimit,
        });
      }
    } else {
      source = 'hdx_ucdp';
      result = await hdxImportService.syncFromUcdp({
        days: appConfig.hdxUcdpLookbackDays,
        limit: appConfig.hdxUcdpSyncLimit,
      });
    }

    lastRunAt = new Date().toISOString();
    lastSummary = { ...result, live_sync_source: source };
    lastError = result.error || null;
    try {
      const statsCacheService = require('./statsCacheService');
      await statsCacheService.refreshStatsCache();
    } catch (e) {
      logger.warn('[LiveSync] stats cache refresh skipped:', e.message);
    }
    logger.info(
      `[LiveSync] ${source} done in ${Date.now() - started}ms fetched=${result.fetched} zones=${JSON.stringify(result.summary?.zones || {})}`
    );
    return lastSummary;
  } catch (err) {
    lastError = err.message;
    logger.error('[LiveSync] Failed:', err.message);
    throw err;
  } finally {
    running = false;
  }
}

/** @deprecated starter import disabled — use runLiveDataSync */
async function runDailyStarterImport() {
  return runLiveDataSync();
}

function startDailyImportScheduler() {
  if (!appConfig.liveDataSyncEnabled) {
    logger.info('[LiveSync] Disabled (LIVE_DATA_SYNC_ENABLED=false)');
    return null;
  }

  const intervalMs = appConfig.liveDataSyncIntervalMs;
  const initialDelayMs = appConfig.liveDataSyncInitialDelayMs;

  if (acledService.isConfigured()) {
    logger.info(
      `[LiveSync] ACLED sync every ${Math.round(intervalMs / 3600000)}h (first in ${Math.round(initialDelayMs / 1000)}s)`
    );
  } else {
    logger.warn(
      '[LiveSync] Scheduler on but ACLED_API_KEY/ACLED_EMAIL missing — only community reports will populate the map'
    );
  }

  setTimeout(() => {
    runLiveDataSync().catch((err) => logger.error('[LiveSync] initial run failed:', err.message));
  }, initialDelayMs);

  return setInterval(() => {
    runLiveDataSync().catch((err) => logger.error('[LiveSync] scheduled run failed:', err.message));
  }, intervalMs);
}

function getDailyImportStatus() {
  return {
    mode: 'live_acled_with_hdx_fallback',
    enabled: appConfig.liveDataSyncEnabled,
    acled_configured: acledService.isConfigured(),
    hdx_ucdp_enabled: hdxImportService.isEnabled(),
    hdx_lookback_days: appConfig.hdxUcdpLookbackDays,
    interval_hours: appConfig.liveDataSyncIntervalMs / (60 * 60 * 1000),
    lookback_days: appConfig.acledLookbackDays,
    last_run_at: lastRunAt,
    last_summary: lastSummary,
    last_error: lastError,
    simulated_starter_import: false,
  };
}

module.exports = {
  runLiveDataSync,
  runDailyStarterImport,
  startDailyImportScheduler,
  getDailyImportStatus,
};
