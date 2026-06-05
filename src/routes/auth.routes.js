const express = require('express');
const router = express.Router();

const { validate } = require('../middleware/validate');
const { authLimiter } = require('../middleware/rateLimiter');
const authService = require('../services/authService');

// Request OTP (works for any Nigerian phone)
router.post('/request-otp', authLimiter, validate('requestOTP'), async (req, res) => {
  const result = await authService.requestOTP(req.body.phone);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

// Verify OTP → get JWT token
router.post('/verify-otp', authLimiter, validate('verifyOTP'), async (req, res) => {
  const sessionResult = await authService.verifyOtpFromSession(
    req.body.phone,
    req.body.otp,
    req.body.otp_token
  );
  if (sessionResult) {
    if (sessionResult.error) return res.status(401).json(sessionResult);
    return res.json(sessionResult);
  }
  const result = await authService.verifyOTP(req.body.phone, req.body.otp, req.body.otp_token);
  if (result.error) return res.status(401).json(result);
  res.json(result);
});

module.exports = router;
