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
  const { price_per_sqm, eskiz_email, eskiz_password, sms_template,
          sms_enabled,
          discount_enabled, discount_min_sqm, discount_amount,
          discount_percentage, discount_step_sqm,
          worker_salary_percent } = req.body;

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

  if (sms_enabled !== undefined) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('sms_enabled', ?)").run(sms_enabled ? '1' : '0');
  }

  if (sms_template !== undefined) {
    const t = sms_template.trim();
    if (t.length > 0) {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('sms_template', ?)").run(t);
    }
  }

  if (discount_enabled !== undefined) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('discount_enabled', ?)").run(discount_enabled ? '1' : '0');
  }
  if (discount_min_sqm !== undefined) {
    const val = Number(discount_min_sqm);
    if (!isNaN(val) && val >= 0) {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('discount_min_sqm', ?)").run(String(val));
    }
  }
  if (discount_amount !== undefined) {
    const val = Number(discount_amount);
    if (!isNaN(val) && val >= 0) {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('discount_amount', ?)").run(String(val));
    }
  }
  if (discount_percentage !== undefined) {
    const val = Number(discount_percentage);
    if (!isNaN(val) && val >= 0 && val <= 100) {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('discount_percentage', ?)").run(String(val));
    }
  }
  if (discount_step_sqm !== undefined) {
    const val = Number(discount_step_sqm);
    if (!isNaN(val) && val > 0) {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('discount_step_sqm', ?)").run(String(val));
    }
  }

  if (worker_salary_percent !== undefined) {
    const val = Number(worker_salary_percent);
    if (!isNaN(val) && val >= 0 && val <= 100) {
      // Eski qiymatni o'qi (yangilashdan OLDIN)
      const oldRow = db.prepare("SELECT value FROM settings WHERE key='worker_salary_percent'").get();
      const oldVal = oldRow ? Number(oldRow.value) : 20;

      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('worker_salary_percent', ?)").run(String(val));

      // Tarix bo'sh bo'lsa — eski qiymatni boshidan seed qil (1970-01-01)
      const histCount = db.prepare("SELECT COUNT(*) as c FROM salary_percent_history").get().c;
      if (histCount === 0) {
        db.prepare("INSERT INTO salary_percent_history (percent, effective_from) VALUES (?, '1970-01-01')").run(oldVal);
      }

      // Bugungi yozuv: bor bo'lsa yangilash, yo'q bo'lsa qo'shish
      const today = new Date().toISOString().slice(0, 10);
      const existing = db.prepare("SELECT id FROM salary_percent_history WHERE effective_from = ?").get(today);
      if (existing) {
        db.prepare("UPDATE salary_percent_history SET percent = ? WHERE effective_from = ?").run(val, today);
      } else {
        db.prepare("INSERT INTO salary_percent_history (percent, effective_from) VALUES (?, ?)").run(val, today);
      }
    }
  }

  // Return updated settings
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const result = {};
  for (const row of rows) {
    result[row.key] = row.key === 'price_per_sqm' ? Number(row.value) : row.value;
  }
  res.json(result);
});

// GET /api/settings/salary-percent-history
router.get('/salary-percent-history', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare(
    'SELECT percent, effective_from FROM salary_percent_history ORDER BY effective_from ASC'
  ).all();
  res.json(rows);
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
      hint: "Coolify → grm_backend → Environment Variables ga qo'shing"
    });
  }

  const user = user_id
    ? db.prepare('SELECT name, fcm_token FROM users WHERE id = ?').get(Number(user_id))
    : null;

  if (!user?.fcm_token) {
    return res.status(400).json({ error: "Bu foydalanuvchida FCM token yo'q" });
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
