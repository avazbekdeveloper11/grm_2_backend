const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../routes/auth');
const { getDb } = require('../database');

function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token talab qilinadi' });
  }
  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // token_invalidated_at dan oldin chiqarilgan tokenlarni rad etish
    const db = getDb();
    const row = db.prepare("SELECT value FROM settings WHERE key='token_invalidated_at'").get();
    if (row?.value) {
      const invalidatedAt = Number(row.value);
      if (decoded.iat < invalidatedAt) {
        return res.status(401).json({ error: 'Sessiya muddati tugadi. Qayta login qiling.' });
      }
    }

    req.user = decoded;
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
