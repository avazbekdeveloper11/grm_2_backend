const https = require('https');

const FCM_SERVER_KEY = process.env.FCM_SERVER_KEY || '';

/**
 * FCM Legacy HTTP API orqali push notification yuborish.
 * token — qurilma FCM tokeni
 * title — xabar sarlavhasi
 * body  — xabar matni
 * data  — qo'shimcha ma'lumot (ixtiyoriy)
 */
async function sendPush(token, title, body, data = {}) {
  if (!FCM_SERVER_KEY) {
    console.log('FCM_SERVER_KEY sozlanmagan — push yuborilmadi');
    return;
  }
  if (!token) {
    console.log('FCM token yo\'q — push yuborilmadi');
    return;
  }

  const payload = JSON.stringify({
    to: token,
    notification: { title, body, sound: 'default' },
    data,
    priority: 'high',
    android: { priority: 'HIGH', notification: { sound: 'default', channel_id: 'gilam_orders' } },
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'fcm.googleapis.com',
      path: '/fcm/send',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `key=${FCM_SERVER_KEY}`,
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('FCM natija:', res.statusCode, data);
        resolve(data);
      });
    });
    req.on('error', (e) => {
      console.error('FCM xatolik:', e.message);
      resolve(null); // Xatolik bo'lsa ham davom etamiz
    });
    req.write(payload);
    req.end();
  });
}

/**
 * Haydovchiga olib kelish haqida xabar yuborish
 */
async function notifyPickup(db, driverId, orderId, customerName, address) {
  const user = db.prepare('SELECT fcm_token FROM users WHERE id = ?').get(driverId);
  if (!user?.fcm_token) return;

  await sendPush(
    user.fcm_token,
    `📦 Yangi buyurtma #${String(orderId).padStart(4, '0')}`,
    `${customerName} — ${address}`,
    { type: 'pickup', order_id: String(orderId) }
  );
}

/**
 * Haydovchiga yetkazish haqida xabar yuborish
 */
async function notifyDelivery(db, driverId, orderId, customerName, address) {
  const user = db.prepare('SELECT fcm_token FROM users WHERE id = ?').get(driverId);
  if (!user?.fcm_token) return;

  await sendPush(
    user.fcm_token,
    `✅ Gilam tayyor — yetkazish #${String(orderId).padStart(4, '0')}`,
    `${customerName} — ${address}`,
    { type: 'delivery', order_id: String(orderId) }
  );
}

module.exports = { sendPush, notifyPickup, notifyDelivery };
