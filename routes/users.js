const express = require('express');
const { getDb } = require('../database');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

function generatePassword() {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let pwd = '';
  for (let i = 0; i < 6; i++) {
    pwd += chars[Math.floor(Math.random() * chars.length)];
  }
  return pwd;
}

// GET /api/users?role=worker|driver|admin
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const { role } = req.query;
  let users;
  if (role) {
    users = db
      .prepare('SELECT id, name, login, role, is_active, created_at, fcm_token FROM users WHERE role = ? ORDER BY created_at DESC')
      .all(role);
  } else {
    users = db
      .prepare('SELECT id, name, login, role, is_active, created_at, fcm_token FROM users ORDER BY created_at DESC')
      .all();
  }
  res.json(users);
});

// POST /api/users (admin only)
router.post('/', requireAdmin, (req, res) => {
  const { name, role } = req.body;
  if (!name || !role) {
    return res.status(400).json({ error: 'Ism va rol talab qilinadi' });
  }
  if (!['worker', 'driver', 'upakovchik'].includes(role)) {
    return res.status(400).json({ error: "Rol worker, driver yoki upakovchik bo'lishi kerak" });
  }

  const db = getDb();
  const prefix = role === 'worker' ? 'usta' : role === 'driver' ? 'haydovchi' : 'upakov';
  const existing = db.prepare('SELECT COUNT(*) as c FROM users WHERE role = ?').get(role).c;
  const login = `${prefix}${Number(existing) + 1}`;
  const password = generatePassword();

  try {
    const result = db
      .prepare('INSERT INTO users (name, login, password, role) VALUES (?, ?, ?, ?)')
      .run(name, login, password, role);

    const user = db
      .prepare('SELECT id, name, login, role, is_active, created_at FROM users WHERE id = ?')
      .get(result.lastInsertRowid);

    res.status(201).json({ ...user, generatedPassword: password });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Bu login allaqachon mavjud' });
    }
    throw err;
  }
});

// DELETE /api/users/:id (admin only) - deactivate
router.delete('/:id', requireAdmin, (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
  if (user.role === 'admin') return res.status(403).json({ error: "Adminni o'chirib bo'lmaydi" });
  db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(id);
  res.json({ success: true });
});

// PUT /api/users/password — o'z parolini o'zgartirish (barcha rollar)
router.put('/password', requireAuth, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Joriy va yangi parol talab qilinadi' });
  }
  if (new_password.length < 4) {
    return res.status(400).json({ error: 'Yangi parol kamida 4 ta belgidan iborat bo\'lsin' });
  }
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user || user.password !== current_password) {
    return res.status(400).json({ error: 'Joriy parol noto\'g\'ri' });
  }
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(new_password, req.user.id);
  res.json({ success: true });
});

// PUT /api/users/fcm-token — /:id dan OLDIN bo'lishi shart!
router.put('/fcm-token', requireAuth, (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'token talab qilinadi' });
  const db = getDb();
  db.prepare('UPDATE users SET fcm_token = ? WHERE id = ?').run(token, req.user.id);
  res.json({ success: true });
});

// PUT /api/users/:id/activate (admin only)
router.put('/:id/activate', requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE users SET is_active = 1 WHERE id = ?').run(Number(req.params.id));
  res.json({ success: true });
});

// GET /api/users/:id/password — admin faqat ko'rishi mumkin
router.get('/:id/password', requireAdmin, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT login, password FROM users WHERE id = ?').get(Number(req.params.id));
  if (!user) return res.status(404).json({ error: 'Topilmadi' });
  res.json({ login: user.login, password: user.password });
});

module.exports = router;
