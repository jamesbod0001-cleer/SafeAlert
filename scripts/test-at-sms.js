#!/usr/bin/env node
/**
 * Test Africa's Talking SMS for your app (production or sandbox).
 * Usage:
 *   node scripts/test-at-sms.js +2348012345678
 *   AT_SENDER_ID=YourBrand node scripts/test-at-sms.js 08031234567
 */
require('dotenv').config();

const phone = process.argv[2];
if (!phone) {
  console.error('Usage: node scripts/test-at-sms.js <phone>');
  console.error('Example: node scripts/test-at-sms.js 08031234567');
  process.exit(1);
}

const sms = require('../src/services/smsService');
const auth = require('../src/services/authService');

(async () => {
  const normalised = auth.normalisePhone(phone);
  if (!normalised) {
    console.error('Invalid Nigerian phone:', phone);
    process.exit(1);
  }

  console.log('AT_USERNAME:', process.env.AT_USERNAME);
  console.log('AT_SENDER_ID:', process.env.AT_SENDER_ID || '(not set)');
  console.log('Phone:', normalised);

  sms.initAT();

  const result = await sms.sendOTP({ phone: normalised, otp: '123456' });
  console.log('\nResult:', JSON.stringify(result, null, 2));

  if (!result.success) {
    const isSandbox = (process.env.AT_USERNAME || '').toLowerCase() === 'sandbox';
    console.log('\nNext steps:');
    if (isSandbox) {
      console.log('1. Generate API key at https://account.africastalking.com/apps/sandbox → Settings');
      console.log('2. Wait 5–20 minutes, then run this test again');
      console.log('3. Or use EXPOSE_SANDBOX_OTP=true and sign in via the app (no real SMS)');
      console.log('4. Sandbox SMS may only appear in Sandbox → SMS → Outbox, not on your phone');
    } else {
      console.log('1. Africa\'s Talking → Product Request → Sender ID (Nigeria OTP)');
      console.log('2. Set AT_SENDER_ID=YourApprovedId in .env and redeploy');
    }
    process.exit(1);
  }
  process.exit(0);
})();
