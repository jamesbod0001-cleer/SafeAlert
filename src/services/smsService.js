// src/services/smsService.js
// Africa's Talking SMS + USSD. Gracefully mocks when AT not configured.

const logger = require('../utils/logger');
const appConfig = require('../config/appConfig');

let sms = null;
const DEFAULT_SMS_TIMEOUT_MS = parseInt(process.env.AT_SMS_TIMEOUT_MS || '8000', 10);

function isAtSandbox() {
  return (process.env.AT_USERNAME || '').trim().toLowerCase() === 'sandbox';
}

function isAtProduction() {
  return !!process.env.AT_API_KEY && !isAtSandbox();
}

const RECIPIENT_ERRORS = {
  DoNotDisturbRejection: () =>
    isAtSandbox()
      ? 'SMS blocked: add your phone in Africa\'s Talking → Sandbox → Phone numbers.'
      : 'SMS blocked (DND): use an approved OTP/transactional Sender ID, or the number may be on the national Do-Not-Disturb list.',
  InvalidPhoneNumber: 'Invalid phone number for SMS.',
  UserInBlacklist: 'This number cannot receive SMS from this account.',
  NotSent: 'SMS was not sent. Try again or contact support.',
};

function parseSmsResult(result) {
  const data = result?.SMSMessageData;
  if (!data) return { success: false, error: 'Unexpected SMS provider response' };

  if (data.Message === 'InvalidSenderId') {
    const sender = (process.env.AT_SENDER_ID || '').trim();
    return {
      success: false,
      error: sender
        ? `Sender ID "${sender}" is not approved on your Africa's Talking app. Dashboard → Product Request → Sender ID (Nigeria OTP can take several days).`
        : isAtProduction()
          ? 'Set AT_SENDER_ID to your approved Sender ID (Africa\'s Talking → Product Request → Sender ID). Production apps cannot send OTP without one.'
          : 'Invalid sender ID. For sandbox, leave AT_SENDER_ID empty.',
    };
  }

  const recipients = data.Recipients || [];
  if (!recipients.length) {
    return { success: false, error: data.Message || 'SMS was not delivered' };
  }

  const failed = recipients.filter((r) => r.status !== 'Success');
  if (failed.length === 0) return { success: true };

  const first = failed[0];
  const hintFn = RECIPIENT_ERRORS[first.status];
  const hint = typeof hintFn === 'function' ? hintFn() : hintFn;
  return {
    success: false,
    error: hint || `SMS failed (${first.status || 'unknown'}). ${data.Message || ''}`.trim(),
  };
}

function withTimeout(promise, timeoutMs, label) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function sendSms({ to, message, timeoutMs = DEFAULT_SMS_TIMEOUT_MS }) {
  if (!sms) {
    logger.info(`[SMS mock] to ${Array.isArray(to) ? to.join(',') : to}`);
    return { success: true, mock: true };
  }

  const phones = Array.isArray(to) ? to : [to];
  const senderId = (process.env.AT_SENDER_ID || '').trim();
  const base = { to: phones, message };

  if (isAtProduction() && !senderId) {
    return {
      success: false,
      error:
        'AT_SENDER_ID is required for production. Request an alphanumeric Sender ID in Africa\'s Talking → Product Request, then set AT_SENDER_ID in .env and redeploy.',
    };
  }

  const attempts = senderId ? [{ ...base, from: senderId }] : [base];

  let lastError = 'SMS send failed';
  for (const params of attempts) {
    try {
      const result = await withTimeout(sms.send(params), timeoutMs, 'SMS send');
      const parsed = parseSmsResult(result);
      if (parsed.success) return parsed;
      lastError = parsed.error;
      if (isAtSandbox() && params.from) {
        logger.warn('[SMS] Retry without sender ID after:', lastError);
        try {
          const retry = parseSmsResult(await withTimeout(sms.send(base), timeoutMs, 'SMS retry'));
          if (retry.success) return retry;
          lastError = retry.error;
        } catch (err) {
          lastError = err.message || lastError;
        }
      }
      break;
    } catch (err) {
      lastError = err.message || lastError;
    }
  }

  logger.error('[SMS] send failed:', lastError);
  return { success: false, error: lastError };
}

function initAT() {
  if (!process.env.AT_API_KEY || !process.env.AT_USERNAME) {
    logger.warn('[SMS] Africa\'s Talking not configured — SMS will be logged only');
    return;
  }
  try {
    const AfricasTalking = require('africastalking');
    const AT = AfricasTalking({ apiKey: process.env.AT_API_KEY, username: process.env.AT_USERNAME });
    sms = AT.SMS;
    const mode = isAtSandbox() ? 'sandbox' : 'production';
    logger.info(`[SMS] Africa's Talking initialized (${mode}, user=${process.env.AT_USERNAME})`);
  } catch (err) {
    logger.error('[SMS] AT init error:', err.message);
  }
}

async function sendPanicSMS({ memberPhones, reporterName, lat, lng, timestamp }) {
  const mapsUrl =
    lat != null && lng != null
      ? `https://maps.google.com/?q=${lat},${lng}`
      : 'Open SafeAlert app for live location';
  const time = new Date(timestamp).toLocaleTimeString('en-NG', { hour:'2-digit', minute:'2-digit', hour12:true, timeZone:'Africa/Lagos' });
  const message = `🆘 CITIZEN SOS\n${reporterName||'Someone in your circle'} needs help NOW.\n\n📍 Location:\n${mapsUrl}\n\n🕐 Time: ${time}\n\nCall or come if you can — share with trusted people nearby.\n-- SafeAlert NG (not government dispatch)`;
  return sendSms({ to: memberPhones, message });
}

async function sendZoneAlertSMS({ phones, zone }) {
  const ussd = appConfig.ussdServiceCode ? `Dial ${appConfig.ussdServiceCode} for updates.\n` : '';
  const message = `🚨 ${appConfig.appName}\n${zone.type.toUpperCase()} near ${zone.label} (${zone.state}).\n${zone.reports} reports. AVOID the area.\n${ussd}-- ${appConfig.appName}`;
  const chunks = [];
  for (let i = 0; i < phones.length; i += 100) chunks.push(phones.slice(i, i + 100));
  for (const ch of chunks) {
    const r = await sendSms({ to: ch, message });
    if (!r.success) return r;
  }
  return { success: true };
}

async function sendOTP({ phone, otp, timeoutMs }) {
  const message = `Your SafeAlert NG code: ${otp}\nValid 10 minutes. Do not share.\n-- SafeAlert NG`;
  const result = await sendSms({ to: [phone], message, timeoutMs });
  if (!result.success && !result.mock) {
    logger.error(`[SMS] OTP not delivered to ${phone}: ${result.error}`);
  } else if (result.mock) {
    logger.info(`[SMS mock] OTP ${otp} to ${phone}`);
  }
  return result;
}

async function sendCheckInMissedSMS({ phones, message }) {
  return sendSms({ to: phones, message });
}

async function handleInboundSMS({ from, text }) {
  const cmd = text.trim().toUpperCase();
  const parts = text.trim().split(/\s+/);
  if (cmd === 'SAFE') {
    const checkInService = require('./checkInService');
    const authService = require('./authService');
    const { db } = require('../config/db');
    const { hashAnonymous } = require('../utils/crypto');
    const phone = authService.normalisePhone(from);
    if (phone) {
      const phoneHash = hashAnonymous(phone);
      const snap = await db().collection('users').where('phone_hash', '==', phoneHash).limit(1).get();
      if (!snap.empty) {
        const matched = { id: snap.docs[0].id, ...snap.docs[0].data() };
        if (matched.active_check_in_id) {
          await checkInService.confirmCheckIn(matched.id, matched.active_check_in_id);
          return {
            response: 'SafeAlert NG: Check-in confirmed. Your circle knows you are safe.',
          };
        }
      }
    }
    return { response: 'SafeAlert NG: Marked safe. Panic/circle notified if applicable.' };
  }
  const ussd = appConfig.ussdServiceCode ? `Dial ${appConfig.ussdServiceCode} for full menu` : 'Use the SafeAlert app';
  if (cmd === 'HELP') return { response:`${appConfig.appName}:\nROUTE [from] [to]\nALERT [description]\nSAFE - deactivate panic\n${ussd}` };
  if (parts[0]==='ROUTE' && parts.length>=3) return { response:`${appConfig.appName}: Check app or ${ussd} for live ${parts[1]}→${parts.slice(2).join(' ')} score.` };
  if (parts[0]==='ALERT') return { response:'SafeAlert NG: Alert received. Community notified. Thank you.' };
  return { response:'SafeAlert NG: Unknown command. Reply HELP for commands.' };
}

module.exports = {
  initAT,
  sendPanicSMS,
  sendZoneAlertSMS,
  sendOTP,
  sendCheckInMissedSMS,
  handleInboundSMS,
};
