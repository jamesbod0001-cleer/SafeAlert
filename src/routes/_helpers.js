const appConfig = require('../config/appConfig');
const { db } = require('../config/db');
const { isMemoryDb } = require('../config/firebase');
const { validateProductionEnv } = require('../config/envValidate');
const fallbackData = require('../services/fallbackDataService');

async function healthHandler(req, res) {
  const envCheck = validateProductionEnv();
  // Fast response for App Runner / load balancers (no Firestore round-trip on every probe)
  let firestore_ok =
    isMemoryDb() || !!(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL);
  if (req.query.deep === '1' && !isMemoryDb()) {
    try {
      await db().collection('app_settings').doc('global').get();
      firestore_ok = true;
    } catch {
      firestore_ok = false;
    }
  }

  const atUser = (process.env.AT_USERNAME || '').trim().toLowerCase();
  const fcmWebOk = !!(
    appConfig.firebaseWebApiKey &&
    appConfig.firebaseWebVapidKey &&
    appConfig.firebaseWebProjectId
  );

  res.json({
    status: firestore_ok ? 'ok' : 'degraded',
    service: 'SafeAlert NG API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: isMemoryDb() ? 'memory' : 'firestore',
    firestore_database_id: process.env.FIRESTORE_DATABASE_ID || 'safealert',
    firestore_ok,
    fallback_data: fallbackData.hasFallback(),
    fallback_zones: fallbackData.getMeta().zone_count || 0,
    proximity_alerts: appConfig.proximityAlertsEnabled,
    push_notifications_enabled: appConfig.pushNotificationsEnabled,
    fcm_web_configured: fcmWebOk,
    sms_username: atUser || null,
    sandbox_otp_in_api: atUser === 'sandbox' || process.env.EXPOSE_SANDBOX_OTP === 'true',
    at_sandbox: atUser === 'sandbox',
    budget_mode: appConfig.budgetMode,
    production_env_ok: envCheck.ok,
    env_warnings: envCheck.warnings,
    features: {
      check_in: true,
      resources: true,
      responders: true,
      convoy: true,
      group_geofence: true,
      estate_watch: true,
      report_false_zone: true,
    },
  });
}

function configPublicHandler(req, res) {
  const origin = `${req.protocol}://${req.get('host')}`;
  const downloadPage =
    appConfig.appDownloadUrl ||
    `${origin.replace(/\/$/, '')}/app/download.html`;

  res.json({
    app_name: appConfig.appName,
    map_url: appConfig.mapUrl,
    ussd_service_code: appConfig.ussdServiceCode,
    budget_mode: appConfig.budgetMode,
    data_saver_recommended: true,
    guest_features: ['view_map', 'report_zones', 'offline_packs', 'share_alerts'],
    sign_in_for: ['panic', 'safety_circle', 'help_nearby', 'journey_watch'],
    citizen_sos: true,
    citizen_model:
      'Alerts go to your safety circle and opted-in neighbors via push/WhatsApp — never to government dispatch.',
    mobile: {
      platforms: ['ios', 'android', 'web'],
      ios_app_store_url: appConfig.iosAppStoreUrl || null,
      android_play_store_url: appConfig.androidPlayStoreUrl || null,
      android_apk_url: appConfig.androidApkUrl || null,
      ios_app_id: appConfig.iosAppId || null,
      download_page: downloadPage,
    },
    cost_tips: appConfig.budgetMode
      ? [
          'Map & reports work without sign-in — OTP/SMS only when you need panic or circle.',
          'Keep Data Saver on — uses free push instead of polling.',
          'Download offline state packs on Wi‑Fi before travelling.',
          'Circle alerts use free push when contacts use SafeAlert; SMS only as backup.',
        ]
      : [],
    firebase: appConfig.firebaseWebApiKey
      ? {
          apiKey: appConfig.firebaseWebApiKey,
          authDomain: appConfig.firebaseWebAuthDomain,
          projectId: appConfig.firebaseWebProjectId,
          messagingSenderId: appConfig.firebaseWebMessagingSenderId,
          appId: appConfig.firebaseWebAppId,
          vapidKey: appConfig.firebaseWebVapidKey,
        }
      : null,
    nigeria_states: require('../config/nigeriaStates.json'),
  });
}

module.exports = {
  healthHandler,
  configPublicHandler,
};
