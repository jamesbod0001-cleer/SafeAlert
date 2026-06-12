/**
 * WhatsApp webhook — meet users where they already are.
 * Configure WHATSAPP_VERIFY_TOKEN + WHATSAPP_WEBHOOK_SECRET in .env.
 * POST verifies Meta X-Hub-Signature-256 (HMAC-SHA256 of raw body) when secret is set.
 */
const crypto = require('crypto');
const { db } = require('../config/db');
const appConfig = require('../config/appConfig');
const routeService = require('../services/routeService');
const logger = require('../utils/logger');

function verifyWebhook(mode, token, challenge) {
  if (mode === 'subscribe' && token === appConfig.whatsappVerifyToken) {
    return challenge;
  }
  return null;
}

/**
 * Meta Cloud API signature — sha256 HMAC of raw JSON body using app secret.
 * @param {Buffer|string} rawBody
 * @param {string|undefined} signatureHeader e.g. sha256=abc...
 */
function verifyPostSignature(rawBody, signatureHeader) {
  const secret = appConfig.whatsappWebhookSecret;
  if (!secret) return true;
  if (!signatureHeader || typeof signatureHeader !== 'string') return false;
  const prefix = 'sha256=';
  if (!signatureHeader.startsWith(prefix)) return false;
  const provided = signatureHeader.slice(prefix.length);
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ''), 'utf8');
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'));
  } catch {
    return false;
  }
}

function parseInboundMessage(body) {
  const entry = body?.entry?.[0];
  const change = entry?.changes?.[0];
  const msg = change?.value?.messages?.[0];
  if (!msg || msg.type !== 'text') return null;
  return {
    from: msg.from,
    text: (msg.text?.body || '').trim(),
    messageId: msg.id,
  };
}

function parseSimpleAlert(text) {
  const lower = text.toLowerCase();
  const types = [
    ['kidnap', 'kidnapping'],
    ['robbery', 'armed_robbery'],
    ['bandit', 'banditry'],
    ['terror', 'terror'],
    ['roadblock', 'roadblock'],
    ['checkpoint', 'checkpoint'],
    ['suspicious', 'suspicious'],
  ];
  let type = 'suspicious';
  for (const [kw, t] of types) {
    if (lower.includes(kw)) {
      type = t;
      break;
    }
  }
  return { type, description: text.slice(0, 280) };
}

async function handleTextMessage({ from, text }) {
  const upper = text.toUpperCase().trim();
  const mapUrl = appConfig.mapUrl || 'https://safealertng.com/app/';

  if (upper === 'HELP' || upper === 'HI') {
    return (
      `SafeAlert NG\n` +
      `1) ALERT [what happened] [near where] — report danger\n` +
      `2) ROUTE LAGOS ABUJA — road safety score\n` +
      `3) STATUS — active alerts count\n` +
      `Map: ${mapUrl}`
    );
  }

  if (upper.startsWith('ROUTE ')) {
    const parts = text.trim().split(/\s+/);
    const fromCity = parts[1];
    const toCity = parts[2];
    if (!fromCity || !toCity) return 'Usage: ROUTE Lagos Abuja';
    const id = routeService.routeDocId(fromCity, toCity);
    const snap = await db().collection('routes').doc(id).get();
    if (!snap.exists) {
      return `No community rating yet for ${fromCity} → ${toCity}. Rate it in the app after your journey.`;
    }
    return routeService.formatRouteUssd(snap.data());
  }

  if (upper.startsWith('STATUS')) {
    const statsCacheService = require('./statsCacheService');
    const { stats } = await statsCacheService.getStats();
    return `Nigeria: ${stats.total_active_zones || 0} active community alerts. Open map: ${mapUrl}`;
  }

  if (upper.startsWith('ALERT ') || upper.startsWith('REPORT ')) {
    const body = text.replace(/^(alert|report)\s+/i, '').trim();
    if (body.length < 8) return 'Please add more detail: ALERT armed men near Kaduna highway KM 45';

    const { type, description } = parseSimpleAlert(body);
    const draftId = `wa_${from}_${Date.now()}`;
    await db().collection('whatsapp_drafts').doc(draftId).set({
      id: draftId,
      phone: from,
      type,
      description,
      status: 'pending_geocode',
      source: 'whatsapp',
      created_at: new Date().toISOString(),
    });

    return (
      `Thank you — alert received.\n` +
      `Type: ${type}\n` +
      `A community moderator will place it on the map. ` +
      `For faster pin: use the app or dial ${appConfig.ussdServiceCode || '*384*911#'}.`
    );
  }

  return `Reply HELP for commands. Report: ALERT [incident] [location]`;
}

async function processWebhook(body) {
  const msg = parseInboundMessage(body);
  if (!msg) return { handled: false };
  const reply = await handleTextMessage(msg);
  logger.info(`WhatsApp from ${msg.from}: ${msg.text.slice(0, 80)}`);
  return { handled: true, reply, to: msg.from };
}

module.exports = {
  verifyWebhook,
  verifyPostSignature,
  processWebhook,
  parseInboundMessage,
  handleTextMessage,
};
