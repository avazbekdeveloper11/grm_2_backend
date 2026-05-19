const https = require('https');
const http = require('http');

const ESKIZ_BASE = 'https://notify.eskiz.uz/api';

async function request(method, url, body, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const isHttps = u.protocol === 'https:';
    const options = {
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + u.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };

    const req = (isHttps ? https : http).request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Get Eskiz token using email+password
async function getEskizToken(email, password) {
  const res = await request('POST', `${ESKIZ_BASE}/auth/login`, {
    email,
    password,
  });
  if (res.status === 200 && res.body?.data?.token) {
    return res.body.data.token;
  }
  throw new Error(`Eskiz login failed: ${JSON.stringify(res.body)}`);
}

// Send SMS via Eskiz
async function sendSms(phone, message, token) {
  // Normalize phone: remove +, spaces, dashes → must start with 998
  let normalized = phone.replace(/[\s\-\+\(\)]/g, '');
  if (normalized.startsWith('8') && normalized.length === 11) {
    normalized = '7' + normalized.slice(1); // Russian format
  }
  if (!normalized.startsWith('998')) {
    normalized = '998' + normalized.replace(/^0/, '');
  }

  const res = await request(
    'POST',
    `${ESKIZ_BASE}/message/sms/send`,
    {
      mobile_phone: normalized,
      message,
      from: '4546',
      callback_url: '',
    },
    token
  );

  if (res.status === 200 || res.status === 201) {
    return { success: true, data: res.body };
  }
  throw new Error(`SMS yuborishda xatolik: ${JSON.stringify(res.body)}`);
}

// Main entry: send "tayyor" notification
async function sendReadyNotification(phone, customerName, db) {
  try {
    const emailRow = db
      .prepare("SELECT value FROM settings WHERE key = 'eskiz_email'")
      .get();
    const passRow = db
      .prepare("SELECT value FROM settings WHERE key = 'eskiz_password'")
      .get();

    if (!emailRow?.value || !passRow?.value) {
      console.log('SMS: Eskiz credentials sozlanmagan, SMS yuborilmadi');
      return { sent: false, reason: 'credentials_missing' };
    }

    const token = await getEskizToken(emailRow.value, passRow.value);

    const templateRow = db
      .prepare("SELECT value FROM settings WHERE key = 'sms_template'")
      .get();
    const template = templateRow?.value ||
      "Hurmatli {ism}, buyumlaringiz tayyor! Yetkazib berish uchun bog'lanamiz. Gilam yuvish xizmati.";
    const message = template.replace(/\{ism\}/gi, customerName);

    await sendSms(phone, message, token);
    console.log(`SMS yuborildi: ${phone}`);
    return { sent: true };
  } catch (err) {
    console.error('SMS xatolik:', err.message);
    return { sent: false, reason: err.message };
  }
}

module.exports = { sendReadyNotification, getEskizToken, sendSms };
