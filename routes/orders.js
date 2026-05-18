const express = require('express');
const { getDb } = require('../database');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendReadyNotification } = require('../services/sms_service');
const { notifyPickup, notifyDelivery } = require('../services/fcm_service');
const { broadcast } = require('../websocket');

const router = express.Router();

function getPricePerSqm(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'price_per_sqm'").get();
  return row ? Number(row.value) : 15000;
}

function recalcOrderTotal(db, orderId) {
  const carpets = db.prepare('SELECT price FROM carpets WHERE order_id = ?').all(orderId);
  const total = carpets.reduce((sum, c) => sum + c.price, 0);
  db.prepare('UPDATE orders SET total_price = ? WHERE id = ?').run(total, orderId);
  return total;
}

// GET /api/orders
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const { user } = req;

  let orders;
  if (user.role === 'worker') {
    orders = db.prepare(`
      SELECT o.*, uw.name as worker_name, ud.name as driver_name
      FROM orders o
      LEFT JOIN users uw ON uw.id = o.assigned_worker_id
      LEFT JOIN users ud ON ud.id = o.assigned_driver_id
      WHERE o.assigned_worker_id = ?
      ORDER BY o.created_at DESC
    `).all(user.id);
  } else if (user.role === 'driver') {
    orders = db.prepare(`
      SELECT o.*, uw.name as worker_name, ud.name as driver_name
      FROM orders o
      LEFT JOIN users uw ON uw.id = o.assigned_worker_id
      LEFT JOIN users ud ON ud.id = o.assigned_driver_id
      WHERE o.assigned_driver_id = ?
      ORDER BY o.created_at DESC
    `).all(user.id);
  } else {
    orders = db.prepare(`
      SELECT o.*, uw.name as worker_name, ud.name as driver_name
      FROM orders o
      LEFT JOIN users uw ON uw.id = o.assigned_worker_id
      LEFT JOIN users ud ON ud.id = o.assigned_driver_id
      ORDER BY o.created_at DESC
    `).all();
  }
  // Har bir order uchun items_summary qo'shamiz
  const itemsQuery = db.prepare(`
    SELECT oi.order_id,
      SUM(CASE WHEN s.unit_type='sqm'   THEN oi.area     ELSE 0 END) as total_sqm,
      SUM(CASE WHEN s.unit_type='meter' THEN oi.quantity  ELSE 0 END) as total_meter,
      SUM(CASE WHEN s.unit_type='piece' THEN oi.quantity  ELSE 0 END) as total_piece,
      COUNT(*) as items_count
    FROM order_items oi
    JOIN services s ON s.id = oi.service_id
    WHERE oi.order_id IN (${orders.map(() => '?').join(',') || '0'})
    GROUP BY oi.order_id
  `);
  const summaries = orders.length > 0
    ? itemsQuery.all(...orders.map(o => o.id))
    : [];
  const summaryMap = {};
  for (const s of summaries) summaryMap[s.order_id] = s;

  const result = orders.map(o => ({
    ...o,
    items_summary: summaryMap[o.id] || null,
  }));
  res.json(result);
});

// GET /api/orders/:id
router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const order = db.prepare(`
    SELECT o.*, uw.name as worker_name, ud.name as driver_name
    FROM orders o
    LEFT JOIN users uw ON uw.id = o.assigned_worker_id
    LEFT JOIN users ud ON ud.id = o.assigned_driver_id
    WHERE o.id = ?
  `).get(Number(req.params.id));
  if (!order) return res.status(404).json({ error: 'Buyurtma topilmadi' });
  res.json(order);
});

// POST /api/orders
router.post('/', requireAdmin, (req, res) => {
  const db = getDb();
  const {
    customer_name, phone, address,
    pickup_date, delivery_date,
    assigned_worker_id, assigned_driver_id,
    notes, carpet_count, carpet_types,
  } = req.body;

  if (!customer_name || !phone || !address || !pickup_date || !delivery_date) {
    return res.status(400).json({ error: "Majburiy maydonlar to'ldirilmagan" });
  }

  const result = db.prepare(`
    INSERT INTO orders
      (customer_name, phone, address, pickup_date, delivery_date,
       assigned_worker_id, assigned_driver_id, notes, carpet_count, carpet_types)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    customer_name, phone, address, pickup_date, delivery_date,
    assigned_worker_id || null, assigned_driver_id || null,
    notes || null,
    carpet_count || 0,
    carpet_types || null,
  );

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(result.lastInsertRowid);
  broadcast('order_created', { order_id: order.id });
  res.status(201).json(order);
});

// PUT /api/orders/:id
router.put('/:id', requireAuth, async (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ error: 'Buyurtma topilmadi' });

  const {
    customer_name, phone, address,
    pickup_date, delivery_date,
    status, payment_status,
    assigned_worker_id, assigned_driver_id,
    notes, carpet_count, carpet_types,
  } = req.body;

  const previousStatus = order.status;
  const newStatus = status ?? order.status;

  db.prepare(`
    UPDATE orders SET
      customer_name = ?, phone = ?, address = ?,
      pickup_date = ?, delivery_date = ?,
      status = ?, payment_status = ?,
      assigned_worker_id = ?, assigned_driver_id = ?,
      notes = ?, carpet_count = ?, carpet_types = ?
    WHERE id = ?
  `).run(
    customer_name ?? order.customer_name,
    phone ?? order.phone,
    address ?? order.address,
    pickup_date ?? order.pickup_date,
    delivery_date ?? order.delivery_date,
    newStatus,
    payment_status ?? order.payment_status,
    assigned_worker_id !== undefined ? (assigned_worker_id || null) : order.assigned_worker_id,
    assigned_driver_id !== undefined ? (assigned_driver_id || null) : order.assigned_driver_id,
    notes !== undefined ? (notes || null) : order.notes,
    carpet_count ?? order.carpet_count,
    carpet_types !== undefined ? (carpet_types || null) : order.carpet_types,
    id
  );

  const result = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);

  // 1. SMS — tayyor holatida mijozga
  if (previousStatus !== 'tayyor' && newStatus === 'tayyor') {
    sendReadyNotification(result.phone, result.customer_name, db)
      .then((r) => console.log('SMS natija:', r))
      .catch((e) => console.error('SMS xatolik:', e));

    // Push — yetkazish uchun tayinlangan haydovchiga
    if (result.assigned_driver_id) {
      notifyDelivery(db, result.assigned_driver_id, id,
        result.customer_name, result.address)
        .catch((e) => console.error('Push xatolik:', e));
    }
  }

  // 2. Push — yangi haydovchi tayinlanganda (pickup uchun)
  const prevDriverId = order.assigned_driver_id;
  const newDriverId = assigned_driver_id !== undefined
    ? (assigned_driver_id || null) : order.assigned_driver_id;

  if (newDriverId && newDriverId !== prevDriverId &&
      newStatus !== 'tayyor' && newStatus !== 'yetkazildi') {
    notifyPickup(db, newDriverId, id, result.customer_name, result.address)
      .catch((e) => console.error('Push xatolik:', e));
  }

  broadcast('order_updated', { order_id: id, status: result.status });
  res.json(result);
});

// DELETE /api/orders/:id
router.delete('/:id', requireAdmin, (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ error: 'Buyurtma topilmadi' });
  db.prepare('DELETE FROM carpets WHERE order_id = ?').run(id);
  db.prepare('DELETE FROM orders WHERE id = ?').run(id);
  broadcast('order_deleted', { order_id: id });
  res.json({ success: true });
});

// POST /api/orders/:id/carpets
router.post('/:id/carpets', requireAuth, (req, res) => {
  const db = getDb();
  const orderId = Number(req.params.id);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return res.status(404).json({ error: 'Buyurtma topilmadi' });

  const { carpets, pickup_lat, pickup_lng } = req.body;
  if (!Array.isArray(carpets)) {
    return res.status(400).json({ error: 'carpets massivi talab qilinadi' });
  }

  // Save pickup location if provided
  if (pickup_lat != null && pickup_lng != null) {
    db.prepare('UPDATE orders SET pickup_lat = ?, pickup_lng = ? WHERE id = ?')
      .run(Number(pickup_lat), Number(pickup_lng), orderId);
  }

  const pricePerSqm = getPricePerSqm(db);
  db.prepare('DELETE FROM carpets WHERE order_id = ?').run(orderId);

  const insertCarpet = db.prepare(
    'INSERT INTO carpets (order_id, width, height, area, price) VALUES (?, ?, ?, ?, ?)'
  );
  for (const { width, height } of carpets) {
    const w = Number(width);
    const h = Number(height);
    if (isNaN(w) || isNaN(h) || w <= 0 || h <= 0) continue;
    const area = w * h;
    const price = area * pricePerSqm;
    insertCarpet.run(orderId, w, h, area, price);
  }

  const total = recalcOrderTotal(db, orderId);
  const savedCarpets = db.prepare('SELECT * FROM carpets WHERE order_id = ?').all(orderId);

  // Update carpet_count to actual count from driver input
  db.prepare('UPDATE orders SET carpet_count = ? WHERE id = ?').run(savedCarpets.length, orderId);

  res.status(201).json({ carpets: savedCarpets, total_price: total, carpet_count: savedCarpets.length });
});

// GET /api/orders/:id/carpets
router.get('/:id/carpets', requireAuth, (req, res) => {
  const db = getDb();
  const carpets = db
    .prepare('SELECT * FROM carpets WHERE order_id = ?')
    .all(Number(req.params.id));
  res.json(carpets);
});

// POST /api/orders/:id/collect  — haydovchi to'lovni oldi
router.post('/:id/collect', requireAuth, (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ error: 'Buyurtma topilmadi' });

  const collectorId = req.user.id;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE orders
    SET payment_status = 'tolangan', collected_by = ?, collected_at = ?
    WHERE id = ?
  `).run(collectorId, now, id);

  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  res.json(updated);
});

// GET /api/drivers/collections?date=2026-05-17  — admin: haydovchilar yig'imi
router.get('/drivers/collections', requireAuth, (req, res) => {
  const db = getDb();
  const { date } = req.query;

  let where = "o.payment_status = 'tolangan' AND o.collected_by IS NOT NULL";
  const params = [];

  if (date) {
    where += " AND date(o.collected_at) = ?";
    params.push(date);
  }

  // Per-driver totals
  const rows = db.prepare(`
    SELECT
      u.id, u.name,
      COUNT(o.id) as order_count,
      SUM(o.total_price) as total_collected,
      GROUP_CONCAT(o.id) as order_ids
    FROM users u
    LEFT JOIN orders o ON o.collected_by = u.id AND ${where}
    WHERE u.role = 'driver' AND u.is_active = 1
    GROUP BY u.id
  `).all(...params);

  // Uncollected (assigned to driver but not paid)
  const uncollected = db.prepare(`
    SELECT
      u.id as driver_id, u.name as driver_name,
      o.id, o.customer_name, o.total_price, o.status
    FROM orders o
    JOIN users u ON u.id = o.assigned_driver_id
    WHERE o.payment_status = 'tolanmagan'
      AND o.assigned_driver_id IS NOT NULL
    ORDER BY o.created_at DESC
  `).all();

  res.json({ drivers: rows, uncollected });
});

module.exports = router;
