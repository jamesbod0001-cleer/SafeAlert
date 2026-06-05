// src/services/pushService.js
const { getMessaging } = require('../config/firebase');
const logger = require('../utils/logger');

async function sendPush({ tokens, type, body, data={} }) {
  const messaging = getMessaging();
  const titles = { CRITICAL_ZONE:'🚨 CRITICAL ALERT', NEAR_YOU:'⚠️ Danger Near You', CIRCLE_PANIC:'🆘 EMERGENCY', JOURNEY_STOPPED:'⚠️ Journey Alert', ZONE_CLEARED:'✅ Zone Cleared' };
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
  return sendPush({ tokens, type:zone.severity==='critical'?'CRITICAL_ZONE':'NEAR_YOU', body:`${zone.reports} reports of ${zone.type} near ${zone.label}. Avoid the area.`, data:{ zone_id:zone.id, lat:zone.lat, lng:zone.lng } });
}

async function notifyCirclePanic({ circle, reporterName, lat, lng }) {
  const tokens = circle.map(m=>m.fcm_token).filter(Boolean);
  if (!tokens.length) return;
  return sendPush({ tokens, type:'CIRCLE_PANIC', body:`${reporterName||'Someone'} in your circle activated PANIC. Check their location now.`, data:{ lat, lng } });
}

module.exports = { sendPush, notifyNearbyUsers, notifyCirclePanic };
