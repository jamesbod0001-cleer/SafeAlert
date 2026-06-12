function parseJsonEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function parseListEnv(name, fallback = []) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function intEnv(name, fallback) {
  const v = parseInt(process.env[name], 10);
  return Number.isFinite(v) ? v : fallback;
}

function floatEnv(name, fallback) {
  const v = parseFloat(process.env[name]);
  return Number.isFinite(v) ? v : fallback;
}

const nigeriaEmergencyContacts = require('./nigeriaEmergencyContacts');
const parsedEmergencyContacts = parseJsonEnv('EMERGENCY_CONTACTS', []);

const isProduction = process.env.NODE_ENV === 'production';
const budgetMode = process.env.BUDGET_MODE === 'true';

function effectiveLocationMinIntervalSec() {
  const configured = intEnv('LOCATION_MIN_INTERVAL_SEC', 300);
  if (budgetMode) return Math.max(configured, intEnv('BUDGET_LOCATION_MIN_INTERVAL_SEC', 1800));
  return configured;
}

module.exports = {
  isProduction,
  budgetMode,
  appName: process.env.APP_NAME || 'SafeAlert NG',
  mapUrl: process.env.APP_MAP_URL || '',
  ussdServiceCode: process.env.USSD_SERVICE_CODE || '',
  corsOrigins: parseListEnv('CORS_ORIGINS', []),
  pushNotificationsEnabled: process.env.PUSH_NOTIFICATIONS_ENABLED !== 'false',
  panicSmsEnabled: process.env.PANIC_SMS_ENABLED !== 'false',
  /** In budget mode: SMS circle only when member has no FCM token on SafeAlert. */
  panicSmsFallbackOnly: process.env.PANIC_SMS_FALLBACK_ONLY === 'true' || budgetMode,
  panicCooldownSec: intEnv('PANIC_COOLDOWN_SEC', 900),
  panicEventTtlHours: intEnv('PANIC_EVENT_TTL_HOURS', 24),
  firebaseWebApiKey: process.env.FIREBASE_WEB_API_KEY || '',
  firebaseWebAuthDomain: process.env.FIREBASE_WEB_AUTH_DOMAIN || '',
  firebaseWebProjectId: process.env.FIREBASE_PROJECT_ID || '',
  firebaseWebMessagingSenderId: process.env.FIREBASE_WEB_MESSAGING_SENDER_ID || '',
  firebaseWebAppId: process.env.FIREBASE_WEB_APP_ID || '',
  firebaseWebVapidKey: process.env.FIREBASE_WEB_VAPID_KEY || '',
  defaultNotifyRadiusKm: floatEnv('CRITICAL_ZONE_RADIUS_KM', 30),
  /** Max location docs fetched per geohash cell (raise in dense cities). */
  geohashCellLimit: intEnv('GEOHASH_CELL_LIMIT', 500),
  /** Nearby strangers get FCM only; SMS to circle. Off by default at scale. */
  criticalZoneSmsEnabled: process.env.CRITICAL_ZONE_SMS_ENABLED === 'true',
  criticalZoneSmsMax: intEnv('CRITICAL_ZONE_SMS_MAX', 0),
  notifyQueueConcurrency: intEnv('NOTIFY_QUEUE_CONCURRENCY', 3),
  /** embedded | publisher | worker | all — controls Firestore pump vs Pub/Sub */
  notifyQueueRole: process.env.NOTIFY_QUEUE_ROLE || 'embedded',
  notifyPubSubEnabled: process.env.NOTIFY_PUBSUB_ENABLED === 'true',
  notifyPubSubTopic: process.env.NOTIFY_PUBSUB_TOPIC || 'safealert-notify-jobs',
  notifyPubSubSubscription:
    process.env.NOTIFY_PUBSUB_SUBSCRIPTION || 'safealert-notify-worker',
  panicBroadcastRadiusKm: floatEnv('PANIC_BROADCAST_RADIUS_KM', 10),
  locationMinIntervalSec: effectiveLocationMinIntervalSec(),
  locationTtlMinutes: intEnv('LOCATION_TTL_MINUTES', 45),
  helpNearbyMaxRadiusKm: floatEnv('HELP_NEARBY_MAX_RADIUS_KM', 15),
  proximityAlertsEnabled: process.env.PROXIMITY_ALERTS_ENABLED !== 'false',
  panicAutoBroadcastEnabled: process.env.PANIC_AUTO_BROADCAST_ENABLED !== 'false',
  routeSafeThreshold: intEnv('ROUTE_SAFE_THRESHOLD', 65),
  routeDangerThreshold: intEnv('ROUTE_DANGER_THRESHOLD', 35),
  ussdMaxRoutesMenu: intEnv('USSD_MAX_ROUTES_MENU', 5),
  ussdMaxZonesMenu: intEnv('USSD_MAX_ZONES_MENU', 4),
  zoneClearThreshold: floatEnv('ZONE_CLEAR_THRESHOLD', 0.7),
  /** Live ACLED sync (replaces simulated starter daily import) */
  liveDataSyncEnabled: process.env.LIVE_DATA_SYNC_ENABLED !== 'false',
  liveDataSyncIntervalMs: intEnv('LIVE_DATA_SYNC_INTERVAL_MS', 6 * 60 * 60 * 1000),
  liveDataSyncInitialDelayMs: intEnv('LIVE_DATA_SYNC_INITIAL_DELAY_MS', 3 * 60 * 1000),
  acledApiKey: process.env.ACLED_API_KEY || '',
  acledEmail: process.env.ACLED_EMAIL || '',
  acledPassword: process.env.ACLED_PASSWORD || '',
  acledLookbackDays: intEnv('ACLED_LOOKBACK_DAYS', 30),
  acledSyncLimit: intEnv('ACLED_SYNC_LIMIT', 500),
  /** HDX UCDP fallback when ACLED API returns 403 */
  hdxUcdpEnabled: process.env.HDX_UCDP_ENABLED !== 'false',
  hdxUcdpLookbackDays: intEnv('HDX_UCDP_LOOKBACK_DAYS', 730),
  hdxUcdpSyncLimit: intEnv('HDX_UCDP_SYNC_LIMIT', 2000),
  hdxUcdpUrl: process.env.HDX_UCDP_URL || '',
  blockSimulatedData: process.env.BLOCK_SIMULATED_DATA !== 'false',
  aiInsightsEnabled: process.env.AI_INSIGHTS_ENABLED !== 'false',
  aiInsightsUseOpenAi:
    process.env.AI_INSIGHTS_ENABLED !== 'false' &&
    !budgetMode &&
    process.env.AI_INSIGHTS_USE_OPENAI === 'true',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
  whatsappWebhookSecret: process.env.WHATSAPP_WEBHOOK_SECRET || '',
  /** When set, POST /sms/inbound requires matching X-Webhook-Secret header */
  smsInboundWebhookSecret: process.env.SMS_INBOUND_WEBHOOK_SECRET || '',
  zeroRatingInfoUrl: process.env.ZERO_RATING_INFO_URL || '',
  zonesMaxPerQuery: intEnv('ZONES_MAX_PER_QUERY', 300),
  zonesStateQueryLimit: intEnv('ZONES_STATE_QUERY_LIMIT', 250),
  zonesPriorityLimit: intEnv('ZONES_PRIORITY_LIMIT', 40),
  statsCacheTtlMs: intEnv('STATS_CACHE_TTL_MS', 900000),
  statsRebuildPageSize: intEnv('STATS_REBUILD_PAGE_SIZE', 400),
  statsRebuildMaxPages: intEnv('STATS_REBUILD_MAX_PAGES', 8),
  routesMaxList: intEnv('ROUTES_MAX_LIST', 100),
  groupsMaxList: intEnv('GROUPS_MAX_LIST', 80),
  importJobSecret: process.env.IMPORT_JOB_SECRET || '',
  /** @deprecated use LIVE_DATA_SYNC_ENABLED */
  dailyImportEnabled: process.env.DAILY_IMPORT_ENABLED === 'true',
  severityThresholds: {
    low: intEnv('SEVERITY_THRESHOLD_LOW', 1),
    medium: intEnv('SEVERITY_THRESHOLD_MEDIUM', 3),
    high: intEnv('SEVERITY_THRESHOLD_HIGH', 5),
    critical: intEnv('SEVERITY_THRESHOLD_CRITICAL', 10),
  },
  incidentTypes: parseListEnv('INCIDENT_TYPES', []),
  emergencyContacts: parsedEmergencyContacts.length
    ? parsedEmergencyContacts
    : nigeriaEmergencyContacts.flat,
  emergencyContactsGrouped: nigeriaEmergencyContacts.groups,
  emergencyContactsDisclaimer: nigeriaEmergencyContacts.disclaimer,
  /** Native app store links (set when published). */
  iosAppStoreUrl: process.env.IOS_APP_STORE_URL || '',
  androidPlayStoreUrl: process.env.ANDROID_PLAY_STORE_URL || '',
  androidApkUrl: process.env.ANDROID_APK_URL || '',
  iosAppId: process.env.IOS_APP_ID || '',
  appDownloadUrl: process.env.APP_DOWNLOAD_URL || '',
  mobileApiUrl: process.env.MOBILE_API_URL || '',
};
