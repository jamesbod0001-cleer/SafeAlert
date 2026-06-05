const authService = require('../services/authService');

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization token' });
    }
    const token = authHeader.split(' ')[1];
    const user = await authService.validateToken(token);
    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ error: 'Authentication error' });
  }
}

async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return next();
  try {
    const token = authHeader.split(' ')[1];
    const user = await authService.validateToken(token);
    if (user) req.user = user;
  } catch (_) {
    /* silent */
  }
  next();
}

module.exports = { requireAuth, optionalAuth };
