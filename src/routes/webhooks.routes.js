const express = require('express');
const router = express.Router();

const appConfig = require('../config/appConfig');
const { validate } = require('../middleware/validate');
const ussdService = require('../services/ussdService');
const smsService = require('../services/smsService');
const whatsappService = require('../services/whatsappService');
const logger = require('../utils/logger');

function requireSmsWebhookSecret(req, res, next) {
  const secret = appConfig.smsInboundWebhookSecret;
  if (!secret) return next();
  const provided = req.headers['x-webhook-secret'];
  if (provided !== secret) {
    return res.status(401).json({ error: 'Invalid webhook secret' });
  }
  return next();
}

function requireWhatsAppPostAuth(req, res, next) {
  const secret = appConfig.whatsappWebhookSecret;
  if (!secret) return next();

  const bypass = req.headers['x-webhook-secret'];
  if (bypass === secret) return next();

  const signature = req.headers['x-hub-signature-256'];
  const rawBody = req.rawBody ?? (req.body ? JSON.stringify(req.body) : '');
  if (whatsappService.verifyPostSignature(rawBody, signature)) return next();

  return res.status(401).json({ error: 'Invalid webhook signature' });
}

router.post('/ussd', validate('ussd'), async (req, res) => {
  const { sessionId, phoneNumber, text } = req.body;
  logger.info(`USSD: ${phoneNumber} | session: ${sessionId} | input: "${text || ''}"`);

  const response = await ussdService.handleSession({
    phoneNumber,
    text: text || '',
  });

  res.set('Content-Type', 'text/plain');
  res.send(response);
});

router.post('/sms/inbound', requireSmsWebhookSecret, async (req, res) => {
  const { from, text, to, date } = req.body;
  logger.info(`Inbound SMS from ${from}: "${text}"`);

  const result = await smsService.handleInboundSMS({ from, text, to });
  res.status(200).json({ received: true, response: result.response });
});

router.get('/webhooks/whatsapp', (req, res) => {
  const challenge = whatsappService.verifyWebhook(
    req.query['hub.mode'],
    req.query['hub.verify_token'],
    req.query['hub.challenge']
  );
  if (challenge) return res.status(200).send(challenge);
  return res.status(403).send('Forbidden');
});

router.post('/webhooks/whatsapp', requireWhatsAppPostAuth, async (req, res) => {
  try {
    const result = await whatsappService.processWebhook(req.body);
    res.sendStatus(200);
    if (result.handled && result.reply) {
      logger.info(`[WhatsApp] reply queued for ${result.to}: ${result.reply.slice(0, 60)}…`);
    }
  } catch (err) {
    logger.warn('[WhatsApp] webhook error:', err.message);
    res.sendStatus(200);
  }
});

module.exports = router;
