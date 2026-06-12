// src/services/pushService.js
const { getMessaging } = require('../config/firebase');
const runtimeSettings = require('./runtimeSettingsService');
const logger = require('../utils/logger');

async function sendPush({ tokens, type, body, data = {} }) {
  if (!(await runtimeSettings.isPushNotificationsEnabled())) {
    return { success: true, sent: 0, disabled: true };
  }

  const messaging = getMessaging();
  const titles = {
    CRITICAL_ZONE: '🚨 Zone alert',
    NEAR_YOU: '⚠️ Danger near you',
    CIRCLE_PANIC: '🆘 Circle emergency',
    NEARBY_PANIC: '🆘 Panic nearby',
    PANIC_RESPONDER: '✅ Help is coming',
    ESTATE_PANIC: '🆘 Neighbor SOS',
    JOURNEY_STOPPED: '⚠️ Journey alert',
    ZONE_CLEARED: '✅ Zone cleared',
  };
  if (!messaging) { logger.info(`[Push mock] [${type}] to ${tokens.length} devices: ${body}`); return { success:true, mock:true }; }
  if (!tokens||tokens.length===0) return { success:true, sent:0 };
  try {
    const message = { notification:{ title:titles[type]||'SafeAlert NG', body }, data:{ type, ...Object.fromEntries(Object.entries(data).map(([k,v])=>[k,String(v)])) }, android:{ priority:'high' } };
    const chunks=[]; for(let i=0;i<tokens.length;i+=500) chunks.push(tokens.slice(i,i+500));
    let sent=0; for(const ch of chunks){ const r=await messaging.sendEachForMulticast({...message,tokens:ch}); sent+=r.successCount; }
    return { success:true, sent };
  } catch(err) { return { success:false, error:err.message }; }
}

async function notifyNearbyUsers({ zone, users }) {
  const tokens = users.map(u=>u.fcm_token).filter(Boolean);
  if (!tokens.length) return;
  const typeLabel = (zone.type || 'incident').replace(/_/g, ' ');
  const sev = zone.severity === 'critical' ? 'CRITICAL' : 'WARNING';
  return sendPush({
    tokens,
    type: zone.severity === 'critical' ? 'CRITICAL_ZONE' : 'NEAR_YOU',
    body: `${sev}: ${typeLabel} near ${zone.label || zone.state || 'you'} (${zone.reports || 1} report${zone.reports > 1 ? 's' : ''})`,
    data: {
      zone_id: zone.id,
      lat: String(zone.lat),
      lng: String(zone.lng),
      alert_type: 'zone',
      incident_type: zone.type || '',
    },
  });
}

async function notifyCirclePanic({ circle, reporterName, lat, lng, panic_id, short_id }) {
  const tokens = circle.map((m) => m.fcm_token).filter(Boolean);
  if (!tokens.length) return;
  const tag = short_id ? ` #${short_id}` : '';
  return sendPush({
    tokens,
    type: 'CIRCLE_PANIC',
    body: `${reporterName || 'Someone'} in your circle activated PANIC${tag}. Open SafeAlert now.`,
    data: { lat: String(lat), lng: String(lng), panic_id: panic_id || '', short_id: short_id || '' },
  });
}

async function notifyPanicResponder({ victimToken, responderName, panicId, shortId, responderCount }) {
  if (!victimToken) return { success: true, sent: 0 };
  const tag = shortId ? `Alert #${shortId}` : 'your alert';
  const others = responderCount > 1 ? ` (${responderCount} helpers responding)` : '';
  return sendPush({
    tokens: [victimToken],
    type: 'PANIC_RESPONDER',
    body: `${responderName} is on the way for ${tag}${others}.`,
    data: { panic_id: panicId || '', short_id: shortId || '', action: 'open_panic' },
  });
}

module.exports = { sendPush, notifyNearbyUsers, notifyCirclePanic, notifyPanicResponder };
