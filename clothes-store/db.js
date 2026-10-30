'use strict';
require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const DB_NAME = process.env.DB_NAME || 'clothes_store';
if (!/^[A-Za-z0-9_]+$/.test(DB_NAME)) {
  throw new Error('DB_NAME يجب أن يحتوي على حروف إنجليزية وأرقام و _ فقط');
}

const baseConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  charset: 'utf8mb4',
  // قواعد البيانات المستضافة (TiDB / Aiven / ...) تحتاج SSL
  ...(process.env.DB_SSL === 'true'
    ? {
        ssl: {
          minVersion: 'TLSv1.2',
          rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
          ...(process.env.DB_SSL_CA ? { ca: process.env.DB_SSL_CA } : {})
        }
      }
    : {})
};

let pool = null;

const TABLES = [
  `CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,
    role ENUM('customer','admin') NOT NULL DEFAULT 'customer',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS products (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    name_en VARCHAR(150) NULL,
    description TEXT NOT NULL,
    description_en TEXT NULL,
    specs TEXT NOT NULL,
    specs_en TEXT NULL,
    price DECIMAL(10,2) NOT NULL,
    quantity INT UNSIGNED NOT NULL DEFAULT 0,
    size VARCHAR(100) NOT NULL DEFAULT '',
    category ENUM('men','women','kids') NOT NULL,
    image VARCHAR(255) NOT NULL DEFAULT '/uploads/placeholder.svg',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_category (category)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS cart_items (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    product_id INT UNSIGNED NOT NULL,
    qty INT UNSIGNED NOT NULL DEFAULT 1,
    UNIQUE KEY uq_user_product (user_id, product_id),
    CONSTRAINT fk_cart_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_cart_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS orders (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    total DECIMAL(10,2) NOT NULL,
    payment_method ENUM('cash','wallet','card','stripe') NOT NULL,
    address VARCHAR(300) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    status ENUM('pending','confirmed','shipped','delivered','cancelled') NOT NULL DEFAULT 'pending',
    payment_status ENUM('unpaid','paid') NOT NULL DEFAULT 'unpaid',
    stripe_session_id VARCHAR(100) NULL,
    shipped_email_sent TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_order_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS order_items (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    order_id INT UNSIGNED NOT NULL,
    product_id INT UNSIGNED NULL,
    name VARCHAR(150) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    qty INT UNSIGNED NOT NULL,
    CONSTRAINT fk_item_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
];

const SAMPLE_PRODUCTS = [
  ['قميص رجالي كلاسيك', 'قميص قطن أنيق للمناسبات والعمل.', 'قطن 100% - قصّة عادية - غسيل عادي', 29, 20, 'M, L, XL', 'men', 'Classic Men’s Shirt', 'Elegant cotton shirt for work and occasions.', '100% cotton - regular fit - machine wash'],
  ['بنطلون جينز رجالي', 'جينز مريح بقصّة مستقيمة.', 'دينم مرن - لون أزرق داكن', 49, 15, '30, 32, 34, 36', 'men', 'Men’s Jeans', 'Comfortable straight-cut jeans.', 'Stretch denim - dark blue'],
  ['فستان سهرة نسائي', 'فستان طويل بتصميم عصري.', 'قماش ساتان - بطانة داخلية', 79, 8, 'S, M, L', 'women', 'Women’s Evening Dress', 'Long dress with a modern design.', 'Satin fabric - inner lining'],
  ['بلوزة نسائية صيفية', 'بلوزة خفيفة ومناسبة للطقس الحار.', 'قطن ناعم - أكمام قصيرة', 25, 25, 'S, M, L, XL', 'women', 'Women’s Summer Blouse', 'Light blouse suited to hot weather.', 'Soft cotton - short sleeves'],
  ['طقم أطفال قطن', 'طقم مريح من قطعتين للأطفال.', 'قطن ناعم - مناسب للبشرة الحساسة', 22, 30, '4, 6, 8, 10', 'kids', 'Kids’ Cotton Set', 'Comfortable two-piece set for kids.', 'Soft cotton - suitable for sensitive skin'],
  ['جاكيت أطفال شتوي', 'جاكيت دافئ بغطاء رأس.', 'حشوة دافئة - سوستة أمامية', 39, 12, '6, 8, 10, 12', 'kids', 'Kids’ Winter Jacket', 'Warm hooded jacket.', 'Warm padding - front zipper']
];

async function init() {
  // محاولة إنشاء قاعدة البيانات (قد لا تكون مسموحة على الاستضافات، وقتها نكمل لو القاعدة موجودة)
  try {
    const boot = await mysql.createConnection(baseConfig);
    try {
      await boot.query(
        'CREATE DATABASE IF NOT EXISTS `' + DB_NAME + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
      );
    } finally {
      await boot.end();
    }
  } catch (e) {
    console.warn('تخطّي إنشاء قاعدة البيانات:', e.message);
  }

  pool = mysql.createPool({
    ...baseConfig,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: process.env.VERCEL ? 3 : 10,
    enableKeepAlive: true
  });

  for (const sql of TABLES) {
    await pool.query(sql);
  }

  // ترقية قواعد البيانات القديمة: إضافة أعمدة اللغة الإنجليزية للمنتجات
  const enCols = { name_en: 'VARCHAR(150) NULL', description_en: 'TEXT NULL', specs_en: 'TEXT NULL' };
  const [existing] = await pool.query(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'products'",
    [DB_NAME]
  );
  const have = new Set(existing.map((r) => r.COLUMN_NAME));
  for (const [col, def] of Object.entries(enCols)) {
    if (!have.has(col)) await pool.query('ALTER TABLE products ADD COLUMN ' + col + ' ' + def);
  }

  // ترقية: أعمدة الدفع الدولي (Stripe) للطلبات القديمة
  const [oc] = await pool.query(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders'",
    [DB_NAME]
  );
  const haveO = new Set(oc.map((r) => r.COLUMN_NAME));
  if (!haveO.has('payment_status')) {
    await pool.query("ALTER TABLE orders ADD COLUMN payment_status ENUM('unpaid','paid') NOT NULL DEFAULT 'unpaid'");
  }
  if (!haveO.has('stripe_session_id')) {
    await pool.query('ALTER TABLE orders ADD COLUMN stripe_session_id VARCHAR(100) NULL');
  }
  if (!haveO.has('shipped_email_sent')) {
    await pool.query('ALTER TABLE orders ADD COLUMN shipped_email_sent TINYINT(1) NOT NULL DEFAULT 0');
  }
  await pool.query("ALTER TABLE orders MODIFY COLUMN payment_method ENUM('cash','wallet','card','stripe') NOT NULL");

  // حساب الأدمن الأول
  const adminEmail = String(process.env.ADMIN_EMAIL || 'admin@store.com').trim().toLowerCase();
  const generated = !process.env.ADMIN_PASSWORD;
  const adminPassword = String(process.env.ADMIN_PASSWORD || require('crypto').randomBytes(9).toString('base64url'));
  const adminName = String(process.env.ADMIN_NAME || 'مدير المتجر');
  const [admins] = await pool.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (admins.length === 0) {
    const hash = await bcrypt.hash(adminPassword, 10);
    await pool.query(
      "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')",
      [adminName, adminEmail, hash]
    );
    console.log('Admin account created: ' + adminEmail);
    if (generated) console.log('Generated admin password (save it now, shown once): ' + adminPassword);
  }

  // منتجات تجريبية (فقط لو الجدول فارغ)
  const [[{ cnt }]] = await pool.query('SELECT COUNT(*) AS cnt FROM products');
  if (cnt === 0) {
    for (const p of SAMPLE_PRODUCTS) {
      await pool.query(
        'INSERT INTO products (name, description, specs, price, quantity, size, category, name_en, description_en, specs_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        p
      );
    }
    console.log('تمت إضافة منتجات تجريبية');
  }
}

function getPool() {
  if (!pool) throw new Error('قاعدة البيانات غير مهيأة');
  return pool;
}

module.exports = { init, getPool };
