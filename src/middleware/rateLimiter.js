const rateLimit = require('express-rate-limit');
const appConfig = require('../config/appConfig');

const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10);
const max = parseInt(process.env.RATE_LIMIT_MAX || '300', 10);

/** App UI polls zones/routes/stats — do not count login or health against the global cap. */
function skipDefaultRateLimit(req) {
  const p = req.path || '';
  return (
    p === '/v1/health' ||
    p === '/health' ||
    p === '/v1/config/public' ||
    p.startsWith('/v1/auth/')
  );
}

const defaultLimiter = rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipDefaultRateLimit,
  message: { error: 'Too many requests — try again later' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_AUTH_MAX || '40', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many OTP attempts — wait a few minutes and try again' },
});

const panicLimiter = rateLimit({
  windowMs: appConfig.panicCooldownSec * 1000,
  max: parseInt(process.env.RATE_LIMIT_PANIC_MAX || '3', 10),
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: 'Panic cooldown — wait before activating again' },
});

const locationLimiter = rateLimit({
  windowMs: appConfig.locationMinIntervalSec * 1000,
  max: parseInt(process.env.RATE_LIMIT_LOCATION_MAX || '12', 10),
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: 'Location updates too frequent' },
});

/** Anonymous zone confirm/clear — cap votes per IP to limit bot farms. */
const zoneVoteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_ZONE_VOTE_MAX || '30', 10),
  keyGenerator: (req) => req.ip || req.socket?.remoteAddress || 'unknown',
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many zone votes from this network — try again later' },
});

module.exports = {
  defaultLimiter,
  authLimiter,
  panicLimiter,
  locationLimiter,
  zoneVoteLimiter,
};
