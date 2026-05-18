const express = require('express');
const { getDb } = require('../database');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { getEskizToken, sendSms } = require('../services/sms_service');

const router = express.Router();

// GET /api/settings
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const result = {};
  for (const row of rows) {
    // Don't expose password to non-admins
    if (row.key === 'eskiz_password' && req.user.role !== 'admin') continue;
    result[row.key] = isNaN(row.value) ? row.value : Number(row.value);
  }
  // Return eskiz_password as-is (string), not number
  const pwRow = rows.find((r) => r.key === 'eskiz_password');
  if (pwRow && req.user.role === 'admin') result.eskiz_password = pwRow.value;
  const emailRow = rows.find((r) => r.key === 'eskiz_email');
  if (emailRow) result.eskiz_email = emailRow.value;
  res.json(result);
});

// PUT /api/settings
router.put('/', requireAdmin, (req, res) => {
  const db = getDb();
  const { price_per_sqm, eskiz_email, eskiz_password } = req.body;

  if (price_per_sqm !== undefined) {
    const val = Number(price_per_sqm);
    if (isNaN(val) || val <= 0) {
      return res.status(400).json({ error: "Narx musbat son bo'lishi kerak" });
    }
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('price_per_sqm', ?)").run(String(val));
  }

  if (eskiz_email !== undefined) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('eskiz_email', ?)").run(eskiz_email);
  }

  if (eskiz_password !== undefined) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('eskiz_password', ?)").run(eskiz_password);
  }

  // Return updated settings
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const result = {};
  for (const row of rows) {
    result[row.key] = row.key === 'price_per_sqm' ? Number(row.value) : row.value;
  }
  res.json(result);
});

// POST /api/settings/sms-test  — send test SMS to given phone
router.post('/sms-test', requireAdmin, async (req, res) => {
  const db = getDb();
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Telefon raqam talab qilinadi' });

  const emailRow = db.prepare("SELECT value FROM settings WHERE key = 'eskiz_email'").get();
  const passRow = db.prepare("SELECT value FROM settings WHERE key = 'eskiz_password'").get();

  if (!emailRow?.value || !passRow?.value) {
    return res.status(400).json({ error: "Eskiz email va parol sozlanmagan" });
  }

  try {
    const token = await getEskizToken(emailRow.value, passRow.value);
    await sendSms(phone, "Bu Gilam tozalash tizimidan test xabar. SMS ishlayapti!", token);
    res.json({ success: true, message: 'Test SMS yuborildi' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/settings/fcm-test — FCM notification test
router.post('/fcm-test', requireAdmin, async (req, res) => {
  const { user_id } = req.body;
  const db = getDb();

  const envB64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  const envProject = process.env.FIREBASE_PROJECT_ID;

  if (!envB64) {
    return res.status(500).json({
      error: 'FIREBASE_SERVICE_ACCOUNT_B64 Coolify da sozlanmagan!',
      hint: 'Coolify → grm_backend → Environment Variables ga 'qo'shing'
    });
  }

  const user = user_id
    ? db.prepare('SELECT name, fcm_token FROM users WHERE id = ?').get(Number(user_id))
    : null;

  if (!user?.fcm_token) {
    return res.status(400).json({ error: 'Bu foydalanuvchida FCM token yo'q' });
  }

  const { sendPush } = require('../services/fcm_service');
  try {
    await sendPush(user.fcm_token, '🔔 Test xabar', user.name + ' ga test notification', { type: 'test' });
    res.json({ success: true, message: user.name + ' ga notification yuborildi' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
