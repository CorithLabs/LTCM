function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Not authenticated', code: 'UNAUTHENTICATED' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Not authenticated', code: 'UNAUTHENTICATED' });
  }
  if (req.session.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required', code: 'FORBIDDEN' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };