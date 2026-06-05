// src/services/smsService.js
// Africa's Talking SMS + USSD. Gracefully mocks when AT not configured.

const logger = require('../utils/logger');

let sms = null;

function initAT() {
  if (!process.env.AT_API_KEY || !process.env.AT_USERNAME) {
    logger.warn('[SMS] Africa\'s Talking not configured — SMS will be logged only');
    return;
  }
  try {
    const AfricasTalking = require('africastalking');
    const AT = AfricasTalking({ apiKey: process.env.AT_API_KEY, username: process.env.AT_USERNAME });
    sms = AT.SMS;
    logger.info('[SMS] Africa\'s Talking initialized');
  } catch (err) {
    logger.error('[SMS] AT init error:', err.message);
  }
}

async function sendPanicSMS({ memberPhones, reporterName, lat, lng, timestamp }) {
  const mapsUrl = `https://maps.google.com/?q=${lat},${lng}`;
  const time = new Date(timestamp).toLocaleTimeString('en-NG', { hour:'2-digit', minute:'2-digit', hour12:true, timeZone:'Africa/Lagos' });
  const message = `🆘 EMERGENCY ALERT\n${reporterName||'Someone in your circle'} activated PANIC.\n\n📍 Location:\n${mapsUrl}\n\n🕐 Time: ${time}\n\nReply SAFE to ${process.env.AT_SMS_SHORTCODE||'09012345678'} if you reach them.\n-- SafeAlert NG`;
  if (!sms) { logger.info('[SMS mock] Panic SMS to ' + memberPhones.length + ' contacts'); return { success:true, mock:true }; }
  try {
    await sms.send({ to: memberPhones, message, from: process.env.AT_SENDER_ID||'SafeAlert' });
    return { success: true };
  } catch (err) { return { success:false, error:err.message }; }
}

async function sendZoneAlertSMS({ phones, zone }) {
  const message = `🚨 SafeAlert NG\n${zone.type.toUpperCase()} near ${zone.label} (${zone.state}).\n${zone.reports} reports. AVOID the area.\nDial *384*911# for updates.\n-- SafeAlert NG`;
  if (!sms) { logger.info('[SMS mock] Zone alert to ' + phones.length + ' users'); return { success:true, mock:true }; }
  try {
    const chunks = []; for (let i=0;i<phones.length;i+=100) chunks.push(phones.slice(i,i+100));
    for (const ch of chunks) await sms.send({ to:ch, message, from:process.env.AT_SENDER_ID||'SafeAlert' });
    return { success:true };
  } catch (err) { return { success:false, error:err.message }; }
}

async function sendOTP({ phone, otp }) {
  const message = `Your SafeAlert NG code: ${otp}\nValid 10 minutes. Do not share.\n-- SafeAlert NG`;
  if (!sms) { logger.info(`[SMS mock] OTP ${otp} to ${phone}`); return { success:true, mock:true }; }
  try { await sms.send({ to:[phone], message, from:process.env.AT_SENDER_ID||'SafeAlert' }); return { success:true }; }
  catch (err) { return { success:false, error:err.message }; }
}

async function handleInboundSMS({ from, text }) {
  const cmd = text.trim().toUpperCase();
  const parts = text.trim().split(/\s+/);
  if (cmd === 'SAFE') return { response:'SafeAlert NG: Panic deactivated. Circle notified you are safe.' };
  if (cmd === 'HELP') return { response:'SafeAlert NG:\nROUTE [from] [to]\nALERT [description]\nSAFE - deactivate panic\nDial *384*911# for full menu' };
  if (parts[0]==='ROUTE' && parts.length>=3) return { response:`SafeAlert NG: Check app or dial *384*911# for live ${parts[1]}→${parts.slice(2).join(' ')} score.` };
  if (parts[0]==='ALERT') return { response:'SafeAlert NG: Alert received. Community notified. Thank you.' };
  return { response:'SafeAlert NG: Unknown command. Reply HELP for commands.' };
}

module.exports = { initAT, sendPanicSMS, sendZoneAlertSMS, sendOTP, handleInboundSMS };
