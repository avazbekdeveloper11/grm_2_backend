const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'gilam.db');

let db;

function getDb() {
  if (!db) {
    db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
  }
  return db;
}

function initDb() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      login TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','worker','driver')),
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT NOT NULL,
      pickup_date TEXT NOT NULL,
      delivery_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'yangi'
        CHECK(status IN ('yangi','qabulQilindi','yuvilyapti','tayyor','yetkazildi')),
      payment_status TEXT NOT NULL DEFAULT 'tolanmagan'
        CHECK(payment_status IN ('tolanmagan','tolangan')),
      assigned_worker_id INTEGER REFERENCES users(id),
      assigned_driver_id INTEGER REFERENCES users(id),
      notes TEXT,
      carpet_count INTEGER NOT NULL DEFAULT 0,
      carpet_types TEXT,
      total_price REAL NOT NULL DEFAULT 0,
      pickup_lat REAL,
      pickup_lng REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS carpets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      width REAL NOT NULL,
      height REAL NOT NULL,
      area REAL NOT NULL,
      price REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Seed users if empty
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (userCount === 0) {
    const insert = db.prepare(
      'INSERT INTO users (name, login, password, role) VALUES (?, ?, ?, ?)'
    );
    const users = [
      ['Administrator',      'admin',       'admin123', 'admin'],
      ['Usta Alisher',       'usta1',       '1234',     'worker'],
      ['Usta Bobur',         'usta2',       '1234',     'worker'],
      ['Usta Jasur',         'usta3',       '1234',     'worker'],
      ['Usta Sardor',        'usta4',       '1234',     'worker'],
      ['Haydovchi Ulugbek',  'haydovchi1',  '1234',     'driver'],
      ['Haydovchi Mirzo',    'haydovchi2',  '1234',     'driver'],
    ];
    for (const [name, login, password, role] of users) {
      insert.run(name, login, password, role);
    }
    console.log("✓ Foydalanuvchilar yaratildi");
  }

  // Seed settings if empty
  const settingCount = db.prepare('SELECT COUNT(*) as c FROM settings').get().c;
  if (settingCount === 0) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('price_per_sqm', '15000')").run();
    console.log("✓ Sozlamalar yaratildi");
  }

  console.log("✓ Ma'lumotlar bazasi tayyor:", DB_PATH);
  return db;
}

module.exports = { getDb, initDb };
