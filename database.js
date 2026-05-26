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
      fcm_token TEXT,
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
      manual_price REAL,
      pickup_lat REAL,
      pickup_lng REAL,
      collected_by INTEGER REFERENCES users(id),
      collected_at TEXT,
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

    -- Xizmatlar katalogi
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      unit_type TEXT NOT NULL DEFAULT 'piece'
        CHECK(unit_type IN ('sqm','piece')),
      price_per_unit REAL NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Buyurtma tarkibi (har bir xizmat)
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      service_id INTEGER NOT NULL REFERENCES services(id),
      quantity REAL NOT NULL DEFAULT 0,
      width REAL,
      height REAL,
      area REAL,
      unit_price REAL NOT NULL DEFAULT 0,
      total_price REAL NOT NULL DEFAULT 0,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS driver_settlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      driver_id INTEGER NOT NULL REFERENCES users(id),
      amount REAL NOT NULL,
      note TEXT,
      admin_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Migrations — mavjud DB ga yangi ustunlar qo'shish
  const migrations = [
    "ALTER TABLE users ADD COLUMN fcm_token TEXT",
    "ALTER TABLE orders ADD COLUMN collected_by INTEGER REFERENCES users(id)",
    "ALTER TABLE orders ADD COLUMN collected_at TEXT",
    "ALTER TABLE orders ADD COLUMN pickup_lat REAL",
    "ALTER TABLE orders ADD COLUMN pickup_lng REAL",
    "ALTER TABLE orders ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0",
    "ALTER TABLE services ADD COLUMN discount_enabled INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE services ADD COLUMN discount_min_qty REAL NOT NULL DEFAULT 0",
    "ALTER TABLE services ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0",
    "ALTER TABLE orders ADD COLUMN manual_price REAL",
    "ALTER TABLE orders ADD COLUMN advance_payment REAL NOT NULL DEFAULT 0",
  ];
  for (const sql of migrations) {
    try { db.exec(sql); } catch (_) {} // ustun allaqachon bor bo'lsa xato ignore
  }

  // services.unit_type CHECK constraintini 'meter' qo'llab-quvvatlash uchun yangilash
  const constraintOk = (() => {
    try {
      db.prepare("INSERT INTO services (name, unit_type, price_per_unit, sort_order) VALUES ('__test__','meter',1,999)").run();
      db.prepare("DELETE FROM services WHERE name='__test__'").run();
      return true;
    } catch (_) { return false; }
  })();

  if (!constraintOk) {
    db.prepare('PRAGMA foreign_keys=OFF').run();
    try { db.prepare('DROP TABLE IF EXISTS services_new').run(); } catch (_) {}
    db.prepare(`
      CREATE TABLE services_new (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        name          TEXT NOT NULL,
        unit_type     TEXT NOT NULL DEFAULT 'piece'
                        CHECK(unit_type IN ('sqm','piece','meter')),
        price_per_unit REAL NOT NULL DEFAULT 0,
        is_active     INTEGER NOT NULL DEFAULT 1,
        sort_order    INTEGER NOT NULL DEFAULT 0,
        created_at    TEXT DEFAULT (datetime('now'))
      )
    `).run();
    db.prepare('INSERT INTO services_new SELECT * FROM services').run();
    db.prepare('DROP TABLE services').run();
    db.prepare('ALTER TABLE services_new RENAME TO services').run();
    db.prepare('PRAGMA foreign_keys=ON').run();
    console.log("✓ services.unit_type: 'meter' qo'shildi");
  }

  // orders jadvalini to'liq schema bilan sinxronlash (payment_status + assigned_worker_id)
  const ordersInfo = db.prepare("PRAGMA table_info(orders)").all();
  const ordersColNames = new Set(ordersInfo.map(c => c.name));
  const needsRebuild = !ordersColNames.has('assigned_worker_id') || (() => {
    const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='orders'").get()?.sql || '';
    return !sql.includes("'qarz'");
  })();

  if (needsRebuild) {
    console.log('orders jadvalini yangilash boshlandi...');
    db.exec('PRAGMA foreign_keys=OFF');
    db.exec('BEGIN');
    try {
      db.exec('DROP TABLE IF EXISTS orders_new');
      db.exec(`
        CREATE TABLE orders_new (
          id                  INTEGER PRIMARY KEY AUTOINCREMENT,
          customer_name       TEXT NOT NULL,
          phone               TEXT NOT NULL,
          address             TEXT NOT NULL,
          carpet_count        INTEGER NOT NULL DEFAULT 1,
          carpet_types        TEXT NOT NULL DEFAULT '',
          pickup_date         TEXT NOT NULL,
          delivery_date       TEXT NOT NULL,
          price               REAL NOT NULL DEFAULT 0,
          total_price         REAL NOT NULL DEFAULT 0,
          discount_amount     REAL NOT NULL DEFAULT 0,
          advance_payment     REAL NOT NULL DEFAULT 0,
          status              TEXT NOT NULL DEFAULT 'yangi'
                                CHECK(status IN ('yangi','qabulQilindi','yuvilyapti','tayyor','yetkazildi')),
          payment_status      TEXT NOT NULL DEFAULT 'tolanmagan'
                                CHECK(payment_status IN ('tolanmagan','tolangan','qarz')),
          assigned_worker_id  INTEGER REFERENCES users(id),
          assigned_driver_id  INTEGER REFERENCES users(id),
          notes               TEXT,
          items_summary       TEXT,
          pickup_lat          REAL,
          pickup_lng          REAL,
          collected_by        INTEGER REFERENCES users(id),
          collected_at        TEXT,
          created_at          TEXT DEFAULT (datetime('now'))
        )
      `);
      const allNewCols = ['id','customer_name','phone','address','carpet_count','carpet_types',
        'pickup_date','delivery_date','price','total_price','discount_amount','advance_payment',
        'status','payment_status','assigned_worker_id','assigned_driver_id','notes',
        'items_summary','pickup_lat','pickup_lng','collected_by','collected_at','created_at'];
      const cols = allNewCols.filter(c => ordersColNames.has(c)).join(',');
      db.exec(`INSERT INTO orders_new (${cols}) SELECT ${cols} FROM orders`);
      db.exec('DROP TABLE orders');
      db.exec('ALTER TABLE orders_new RENAME TO orders');
      db.exec('COMMIT');
      db.exec('PRAGMA foreign_keys=ON');
      console.log("✓ orders jadval yangilandi: payment_status 'qarz', assigned_worker_id");
    } catch (err) {
      db.exec('ROLLBACK');
      db.exec('PRAGMA foreign_keys=ON');
      console.error('✗ orders migration xato, rollback qilindi:', err.message);
    }
  }

  // Seed services if empty
  const svcCount = db.prepare('SELECT COUNT(*) as c FROM services').get().c;
  if (svcCount === 0) {
    const svc = db.prepare(
      'INSERT INTO services (name, unit_type, price_per_unit, sort_order) VALUES (?,?,?,?)'
    );
    svc.run('Gilam',    'sqm',   15000, 1);
    svc.run('Korpacha', 'sqm',   15000, 2);
    svc.run('Yostiq',   'piece', 10000, 3);
    svc.run('Korpa',    'piece', 60000, 4);
    svc.run('Adyol',    'piece', 50000, 5);
    console.log('✓ Standart xizmatlar qo\'shildi');
  }

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
