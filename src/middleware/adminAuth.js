function requireAdminSecret(req, res, next) {
  const secret = process.env.ADMIN_SECRET || process.env.IMPORT_JOB_SECRET;
  if (!secret) return res.status(503).json({ error: 'ADMIN_SECRET not configured' });
  const provided = req.headers['x-admin-secret'] || req.headers['x-import-secret'];
  if (provided !== secret) return res.status(401).json({ error: 'Invalid admin secret' });
  next();
}

module.exports = { requireAdminSecret };
