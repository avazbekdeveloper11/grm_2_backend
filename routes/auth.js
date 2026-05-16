const express = require('express');
const jwt = require('jsonwebtoken');
const { getDb } = require('../database');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'gilam_secret_key_2024';
const JWT_EXPIRES = '7d';

router.post('/login', (req, res) => {
  const { login, password } = req.body;
  if (!login || !password) {
    return res.status(400).json({ error: 'Login va parol talab qilinadi' });
  }

  const db = getDb();
  const user = db
    .prepare('SELECT * FROM users WHERE login = ? AND password = ? AND is_active = 1')
    .get(login.trim(), password.trim());

  if (!user) {
    return res.status(401).json({ error: "Login yoki parol noto'g'ri" });
  }

  const token = jwt.sign(
    { id: user.id, login: user.login, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );

  const { password: _pwd, ...safeUser } = user;
  res.json({ token, user: safeUser });
});

module.exports = router;
module.exports.JWT_SECRET = JWT_SECRET;
