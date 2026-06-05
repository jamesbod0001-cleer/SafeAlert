// src/services/authService.js
const crypto = require('crypto');
const { db } = require('../config/db');
const { hashAnonymous } = require('../utils/crypto');
const { sendOTP } = require('./smsService');
const { randomUUID: uuidv4 } = require('crypto');
const logger = require('../utils/logger');

const otpStore = new Map();

// Lightweight JWT using built-in crypto (no jsonwebtoken package required)
// Falls back to jsonwebtoken if installed
function signToken(payload) {
  try {
    const jwt = require('jsonwebtoken');
    return jwt.sign(payload, process.env.JWT_SECRET||'dev-secret', { expiresIn:'7d' });
  } catch {
    // Fallback: simple HMAC token for testing
    const data = Buffer.from(JSON.stringify({ ...payload, exp: Date.now()+7*24*3600*1000 })).toString('base64url');
    const sig = crypto.createHmac('sha256', process.env.JWT_SECRET||'dev-secret').update(data).digest('base64url');
    return `${data}.${sig}`;
  }
}

function verifyToken(token) {
  try {
    const jwt = require('jsonwebtoken');
    return jwt.verify(token, process.env.JWT_SECRET||'dev-secret');
  } catch {
    try {
      const [data, sig] = token.split('.');
      const expected = crypto.createHmac('sha256', process.env.JWT_SECRET||'dev-secret').update(data).digest('base64url');
      if (sig !== expected) return null;
      const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
      if (payload.exp < Date.now()) return null;
      return payload;
    } catch { return null; }
  }
}

function normalisePhone(phone) {
  if (!phone) return null;
  let p = phone.toString().replace(/[\s\-().]/g,'');
  if (p.startsWith('0') && p.length===11) p = '+234'+p.slice(1);
  else if (p.startsWith('234') && p.length===13) p = '+'+p;
  const valid = /^\+234[789]\d{9}$/.test(p);
  return valid ? p : null;
}

async function requestOTP(phone) {
  const normalised = normalisePhone(phone);
  if (!normalised) return { error:'Invalid phone number' };
  const otp = Math.floor(100000+Math.random()*900000).toString();
  const phoneHash = hashAnonymous(normalised);
  otpStore.set(phoneHash, { otp, expires:Date.now()+10*60*1000, attempts:0 });
  await sendOTP({ phone:normalised, otp });
  return { success:true, message:'OTP sent', expiresIn:600 };
}

async function verifyOTP(phone, otp) {
  const normalised = normalisePhone(phone);
  if (!normalised) return { error:'Invalid phone number' };
  const phoneHash = hashAnonymous(normalised);
  const record = otpStore.get(phoneHash);
  if (!record) return { error:'OTP not found. Request a new one.' };
  if (Date.now() > record.expires) { otpStore.delete(phoneHash); return { error:'OTP expired.' }; }
  if (record.attempts >= 5) { otpStore.delete(phoneHash); return { error:'Too many attempts.' }; }
  record.attempts++;
  if (record.otp !== otp.toString()) return { error:'Incorrect OTP', attemptsLeft:5-record.attempts };
  otpStore.delete(phoneHash);
  const user = await findOrCreateUser(phoneHash);
  const token = signToken({ userId:user.id, phoneHash });
  return { success:true, token, user:sanitiseUser(user) };
}

async function findOrCreateUser(phoneHash) {
  const database = db();
  const snap = await database.collection('users').where('phone_hash','==',phoneHash).get();
  if (!snap.empty) return snap.docs[0].data();
  const id = uuidv4();
  const now = new Date().toISOString();
  const user = { id, phone_hash:phoneHash, display_name:`User_${id.slice(0,6)}`, state:'', lga:'', fcm_token:null, circle:[], groups:[], journey_active:false, panic_active:false, created_at:now, last_active:now };
  await database.collection('users').doc(id).set(user);
  return user;
}

async function validateToken(token) {
  try {
    const decoded = verifyToken(token);
    if (!decoded) return null;
    const snap = await db().collection('users').doc(decoded.userId).get();
    if (!snap.exists) return null;
    return snap.data();
  } catch { return null; }
}

function sanitiseUser(user) {
  const { phone_hash, ...safe } = user;
  return safe;
}

module.exports = { requestOTP, verifyOTP, validateToken, findOrCreateUser, sanitiseUser, normalisePhone };
