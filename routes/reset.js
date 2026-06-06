const express = require('express');
const { getDb } = require('../database');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// POST /api/reset  — DB ni tozalash, faqat admin qoladi
router.post('/', requireAdmin, (req, res) => {
  const { confirm } = req.body;
  if (confirm !== 'TOZALA') {
    return res.status(400).json({ error: "confirm: 'TOZALA' yuborish kerak" });
  }

  const db = getDb();

  const stmts = [
    'DELETE FROM order_items',
    'DELETE FROM driver_settlements',
    'DELETE FROM carpets',
    'DELETE FROM orders',
    'DELETE FROM services',
    "DELETE FROM users WHERE role != 'admin'",
    "UPDATE users SET fcm_token = NULL, name = 'Administrator', login = 'admin', password = 'admin123' WHERE role = 'admin'",
    "DELETE FROM settings",
    "DELETE FROM sqlite_sequence",
  ];

  for (const sql of stmts) {
    try { db.prepare(sql).run(); } catch (_) {}
  }

  res.json({ success: true, message: "DB to'liq tozalandi. Faqat admin (admin/admin123) qoldi." });
});

// POST /api/reset/orders — faqat buyurtmalarni tozalash (xodimlar, narxlar qoladi)
router.post('/orders', requireAdmin, (req, res) => {
  const { confirm } = req.body;
  if (confirm !== 'BUYURTMALAR') {
    return res.status(400).json({ error: "confirm: 'BUYURTMALAR' yuborish kerak" });
  }

  const db = getDb();

  const stmts = [
    'DELETE FROM order_items',
    'DELETE FROM driver_settlements',
    'DELETE FROM carpets',
    'DELETE FROM orders',
    "DELETE FROM sqlite_sequence WHERE name IN ('orders','carpets','order_items','driver_settlements')",
  ];

  for (const sql of stmts) {
    try { db.prepare(sql).run(); } catch (_) {}
  }

  res.json({ success: true, message: "Barcha buyurtmalar tozalandi. ID 1 dan boshlanadi." });
});

// POST /api/reset/admin-password — admin parolni ko'rish yoki tiklash (vaqtincha)
router.post('/admin-password', (req, res) => {
  const { secret } = req.body;
  if (secret !== 'gilam2026reset') {
    return res.status(403).json({ error: 'Ruxsat yo\'q' });
  }
  const db = getDb();
  const admins = db.prepare("SELECT login, password FROM users WHERE role = 'admin'").all();
  res.json({ success: true, admins });
});

// POST /api/reset/sessions — hamma tokenlarni expire qilish
router.post('/sessions', requireAdmin, (req, res) => {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('token_invalidated_at', ?)").run(String(now));
  res.json({ success: true, message: "Barcha sessiyalar tugatildi. Foydalanuvchilar qayta login qilishi kerak." });
});

module.exports = router;
