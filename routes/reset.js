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

module.exports = router;
