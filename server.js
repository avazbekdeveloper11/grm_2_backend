const http = require('http');
const express = require('express');
const cors = require('cors');
const { initDb } = require('./database');
const { initWebSocket } = require('./websocket');

const authRoutes        = require('./routes/auth');
const usersRoutes       = require('./routes/users');
const ordersRoutes      = require('./routes/orders');
const settingsRoutes    = require('./routes/settings');
const settlementsRoutes = require('./routes/settlements');
const servicesRoutes    = require('./routes/services');
const resetRoutes       = require('./routes/reset');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

initDb();

app.use('/api', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/settlements', settlementsRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/reset', resetRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server xatosi' });
});

// HTTP server + WebSocket
const server = http.createServer(app);
initWebSocket(server);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✓ Server ishlamoqda: http://localhost:${PORT}`);
  console.log(`✓ WebSocket: ws://localhost:${PORT}/ws`);
});
