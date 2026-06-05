// src/utils/crypto.js
// Anonymous hashing — we NEVER store raw phone numbers or device IDs
// Everything is SHA-256 hashed before touching the database

const crypto = require('crypto');

function hashAnonymous(value) {
  if (!value) throw new Error('Cannot hash empty value');
  return crypto.createHash('sha256').update(value.toString().trim().toLowerCase()).digest('hex');
}

function shortHash(value) {
  return 'anon_' + hashAnonymous(value).substring(0, 8);
}

function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function encryptContact(text) {
  const key = Buffer.from((process.env.JWT_SECRET || 'default-key-32-chars-padding!!').padEnd(32).slice(0, 32));
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptContact(encryptedText) {
  try {
    const key = Buffer.from((process.env.JWT_SECRET || 'default-key-32-chars-padding!!').padEnd(32).slice(0, 32));
    const [ivHex, encrypted] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch { return null; }
}

module.exports = { hashAnonymous, shortHash, generateToken, encryptContact, decryptContact };
