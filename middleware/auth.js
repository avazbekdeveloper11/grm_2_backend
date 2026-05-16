const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../routes/auth');

function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token talab qilinadi' });
  }
  const token = header.slice(7);
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token yaroqsiz yoki muddati tugagan' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Faqat admin uchun' });
    }
    next();
  });
}

module.exports = { requireAuth, requireAdmin };
