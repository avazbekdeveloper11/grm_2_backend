const { GoogleAuth } = require('google-auth-library');
const https = require('https');

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'grm-mobile';

// Service account JSON — env var dan olinadi (base64 encoded)
function getServiceAccount() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  if (b64) {
    try {
      return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    } catch (e) {
      console.error('Service account parse xatolik:', e.message);
    }
  }
  // Yoki fayl yo'lidan
  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (path) {
    try {
      return require(path);
    } catch (e) {
      console.error('Service account fayl xatolik:', e.message);
    }
  }
  return null;
}

// OAuth2 access token olish
async function getAccessToken() {
  const sa = getServiceAccount();
  if (!sa) throw new Error('Firebase service account topilmadi');

  const auth = new GoogleAuth({
    credentials: sa,
    scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return token.token;
}

// FCM V1 API orqali push yuborish
async function sendPush(fcmToken, title, body, data = {}) {
  if (!fcmToken) {
    console.log('FCM: token yo\'q — push yuborilmadi');
    return;
  }

  let accessToken;
  try {
    accessToken = await getAccessToken();
  } catch (e) {
    console.error('FCM access token xatolik:', e.message);
    return;
  }

  const message = {
    message: {
      token: fcmToken,
      notification: { title, body },
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      ),
      android: {
        priority: 'HIGH',
        notification: {
          sound: 'order_notification',
          channel_id: 'gilam_orders_v2',
        },
      },
      apns: {
        headers: { 'apns-priority': '10' },
        payload: {
          aps: { sound: 'order_notification.mp3' },
        },
      },
    },
  };

  const payload = JSON.stringify(message);

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'fcm.googleapis.com',
      path: `/v1/projects/${PROJECT_ID}/messages:send`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('✅ FCM V1 push yuborildi:', title);
        } else {
          console.error('❌ FCM V1 xatolik:', res.statusCode, d);
        }
        resolve(d);
      });
    });
    req.on('error', e => {
      console.error('FCM so\'rov xatolik:', e.message);
      resolve(null);
    });
    req.write(payload);
    req.end();
  });
}

// Haydovchiga: yangi olib kelish buyurtmasi
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

// Haydovchiga: gilam tayyor, yetkazish kerak
async function notifyDelivery(db, driverId, orderId, customerName, address) {
  const user = db.prepare('SELECT fcm_token FROM users WHERE id = ?').get(driverId);
  if (!user?.fcm_token) return;
  await sendPush(
    user.fcm_token,
    `🚗 Yetkazish #${String(orderId).padStart(4, '0')}`,
    `Gilam tayyor — ${customerName} ga yetkazish kerak`,
    { type: 'delivery', order_id: String(orderId) }
  );
}

// Ishchiga: yangi zakaz tayinlandi
async function notifyWorkerAssigned(db, workerId, orderId, customerName) {
  const user = db.prepare('SELECT fcm_token FROM users WHERE id = ?').get(workerId);
  if (!user?.fcm_token) return;
  await sendPush(
    user.fcm_token,
    `🧺 Yangi zakaz #${String(orderId).padStart(4, '0')}`,
    `${customerName} — gilam yuvish kerak`,
    { type: 'worker_assigned', order_id: String(orderId) }
  );
}

// Ishchiga: gilam olib kelindi, yuvish boshlash mumkin
async function notifyWorkerPickedUp(db, workerId, orderId, customerName) {
  const user = db.prepare('SELECT fcm_token FROM users WHERE id = ?').get(workerId);
  if (!user?.fcm_token) return;
  await sendPush(
    user.fcm_token,
    `✅ Gilam keldi #${String(orderId).padStart(4, '0')}`,
    `${customerName} — gilam olib kelindi, yuvish mumkin`,
    { type: 'worker_pickup', order_id: String(orderId) }
  );
}

module.exports = { sendPush, notifyPickup, notifyDelivery, notifyWorkerAssigned, notifyWorkerPickedUp };
