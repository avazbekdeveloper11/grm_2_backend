const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./routes/auth');

let wss;
const clients = new Map(); // token → ws

function initWebSocket(server) {
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    // Token URL parametrdan: ws://host/ws?token=xxx
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');

    let user = null;
    try {
      user = jwt.verify(token, JWT_SECRET);
    } catch {
      ws.close(4001, 'Unauthorized');
      return;
    }

    clients.set(ws, user);
    console.log(`WS ulanish: ${user.login} (${user.role})`);

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`WS uzilish: ${user.login}`);
    });

    ws.on('error', () => clients.delete(ws));

    // Ping-pong
    ws.on('message', (msg) => {
      if (msg.toString() === 'ping') ws.send('pong');
    });
  });
}

// Barcha ulangan clientlarga xabar yuborish
function broadcast(type, data = {}) {
  if (!wss) return;
  const msg = JSON.stringify({ type, ...data, ts: Date.now() });
  for (const [ws] of clients) {
    if (ws.readyState === 1) { // OPEN
      ws.send(msg);
    }
  }
}

// Faqat ma'lum rolga yuborish
function broadcastToRole(role, type, data = {}) {
  if (!wss) return;
  const msg = JSON.stringify({ type, ...data, ts: Date.now() });
  for (const [ws, user] of clients) {
    if (ws.readyState === 1 && user.role === role) {
      ws.send(msg);
    }
  }
}

module.exports = { initWebSocket, broadcast, broadcastToRole };
