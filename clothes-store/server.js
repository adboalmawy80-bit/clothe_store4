'use strict';
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { init, getPool } = require('./db');
const stripe = require('./stripe');
const mailer = require('./mailer');

const app = express();
const IS_VERCEL = Boolean(process.env.VERCEL);
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');
if (!IS_VERCEL) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const CATEGORIES = ['men', 'women', 'kids'];
const PAYMENTS = ['cash', 'wallet', 'card', 'stripe'];
const STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+\-\s]{7,20}$/;

class UserError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status || 400;
  }
}

// ---------- الأمان والإعدادات العامة ----------
app.disable('x-powered-by');
app.set('trust proxy', 1); // خلف بروكسي Vercel
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'upgrade-insecure-requests': null,
        'img-src': ["'self'", 'data:', 'https:']
      }
    }
  })
);
// ---------- Stripe webhook (يجب أن يسبق express.json لأن التحقق يحتاج الجسم الخام) ----------
async function cancelUnpaidOrder(orderId, sessionId) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query(
      "UPDATE orders SET status = 'cancelled' WHERE id = ? AND stripe_session_id = ? AND payment_status = 'unpaid' AND status = 'pending'",
      [orderId, sessionId]
    );
    if (r.affectedRows === 1) {
      await conn.query(
        'UPDATE products p JOIN order_items i ON i.product_id = p.id SET p.quantity = p.quantity + i.qty WHERE i.order_id = ?',
        [orderId]
      );
    }
    await conn.commit();
    return r.affectedRows === 1;
  } catch (err) {
    try {
      await conn.rollback();
    } catch (e) {
      /* تجاهل */
    }
    throw err;
  } finally {
    conn.release();
  }
}

app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json', limit: '1mb' }),
  ensureReady,
  async (req, res) => {
    let event;
    try {
      event = stripe.verifyWebhook(req.body, req.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid signature' });
    }
    try {
      const obj = (event.data && event.data.object) || {};
      const orderId = posInt((obj.metadata && obj.metadata.order_id) || obj.client_reference_id);
      if (orderId && obj.id) {
        if (
          (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') &&
          obj.payment_status === 'paid'
        ) {
          await getPool().query(
            "UPDATE orders SET payment_status = 'paid', status = IF(status = 'pending', 'confirmed', status) WHERE id = ? AND stripe_session_id = ?",
            [orderId, obj.id]
          );
        } else if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
          await cancelUnpaidOrder(orderId, obj.id);
        }
      }
      res.json({ received: true });
    } catch (err) {
      console.error('Stripe webhook error:', err.message);
      res.status(500).json({ error: 'Webhook processing failed' }); // Stripe will retry
    }
  }
);

app.use(express.json({ limit: '50kb' }));

// ---------- فحص الإعداد (لا يكشف أي قيم، فقط هل المتغيرات موجودة ونوع خطأ القاعدة) ----------
app.get('/api/health', async (req, res) => {
  const has = (k) => Boolean(String(process.env[k] || '').trim());
  const env = {
    DB_HOST: has('DB_HOST'),
    DB_PORT: has('DB_PORT'),
    DB_USER: has('DB_USER'),
    DB_PASSWORD: has('DB_PASSWORD'),
    DB_NAME: has('DB_NAME'),
    DB_SSL: process.env.DB_SSL || null,
    SESSION_SECRET: has('SESSION_SECRET')
  };
  let db = 'ok';
  let code = null;
  try {
    if (!readyPromise) readyPromise = init();
    await readyPromise;
  } catch (e) {
    readyPromise = null;
    db = 'error';
    code = String(e.code || e.errno || 'UNKNOWN');
  }
  res.set('Cache-Control', 'no-store');
  res.json({ vercel: IS_VERCEL, env, db, dbErrorCode: code });
});

// ---------- الجلسة: كوكي موقّع (HMAC) بدل الذاكرة، يعمل على Vercel ----------
const SESSION_SECRET = process.env.SESSION_SECRET || (IS_VERCEL ? null : crypto.randomBytes(32).toString('hex'));
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.COOKIE_SECURE === 'true' || IS_VERCEL
};

function sign(data) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch (e) { return null; }
    }
  }
  return null;
}

app.use((req, res, next) => {
  if (!SESSION_SECRET) {
    return res.status(500).send('SESSION_SECRET is not set. Add it in the Vercel project environment variables.');
  }
  req.session = { user: null };
  const raw = readCookie(req, 'sid');
  if (raw) {
    const [payload, sig] = raw.split('.');
    if (payload && sig) {
      const a = Buffer.from(sig);
      const b = Buffer.from(sign(payload));
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        try {
          const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
          if (data && data.user && data.exp > Date.now()) req.session.user = data.user;
        } catch (e) { /* تجاهل */ }
      }
    }
  }
  next();
});

// تهيئة قاعدة البيانات مرة واحدة لكل instance (مهم في Serverless)
let readyPromise = null;
function ensureReady(req, res, next) {
  if (!readyPromise) readyPromise = init();
  readyPromise.then(
    () => next(),
    (err) => {
      readyPromise = null;
      console.error('DB init failed:', err.message);
      res.status(500).json({ error: 'حدث خطأ في السيرفر' });
    }
  );
}
app.use('/api', ensureReady);

app.get('/api/config', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ currency: stripe.currency(), stripe: stripe.isEnabled() });
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'محاولات كثيرة، حاول مرة أخرى بعد قليل' }
});

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'يجب تسجيل الدخول أولاً' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'يجب تسجيل الدخول أولاً' });
  if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'غير مصرح لك' });
  next();
}

function startSession(req, res, user) {
  const payload = Buffer.from(JSON.stringify({ user, exp: Date.now() + SESSION_MS })).toString('base64url');
  res.cookie('sid', payload + '.' + sign(payload), { ...COOKIE_OPTS, maxAge: SESSION_MS });
  req.session.user = user;
}

function toProduct(p) {
  return { ...p, price: Number(p.price) };
}

function posInt(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// ---------- الملفات الثابتة وصفحة الأدمن ----------
// نقرأ الملف عند الإقلاع (يضمن أن Vercel يضمّنه داخل الدالة)
const ADMIN_HTML = fs.readFileSync(path.join(__dirname, 'views', 'admin.html'), 'utf8');
app.get('/admin', (req, res) => {
  const u = req.session.user;
  if (!u) return res.redirect('/login.html?next=/admin');
  if (u.role !== 'admin') return res.redirect('/');
  res.set('Cache-Control', 'no-store');
  res.type('html').send(ADMIN_HTML);
});

app.use(express.static(PUBLIC_DIR, { index: 'index.html' }));

// ---------- المصادقة ----------
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

app.post(
  '/api/register',
  authLimiter,
  wrap(async (req, res) => {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (name.length < 2 || name.length > 100) throw new UserError('الاسم يجب أن يكون بين 2 و 100 حرف');
    if (!EMAIL_RE.test(email) || email.length > 150) throw new UserError('البريد الإلكتروني غير صالح');
    if (password.length < 8 || password.length > 72) {
      throw new UserError('كلمة المرور يجب أن تكون من 8 إلى 72 حرفاً');
    }
    const pool = getPool();
    const [exists] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (exists.length) throw new UserError('هذا البريد مسجل بالفعل', 409);
    const hash = await bcrypt.hash(password, 10);
    const [r] = await pool.query(
      "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'customer')",
      [name, email, hash]
    );
    const user = { id: r.insertId, name, email, role: 'customer' };
    startSession(req, res, user);
    res.json({ user });
  })
);

app.post(
  '/api/login',
  authLimiter,
  wrap(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const [rows] = await getPool().query(
      'SELECT id, name, email, role, password_hash FROM users WHERE email = ?',
      [email]
    );
    const row = rows[0];
    const ok = await bcrypt.compare(password, row ? row.password_hash : DUMMY_HASH);
    if (!row || !ok) throw new UserError('البريد أو كلمة المرور غير صحيحة', 401);
    const user = { id: row.id, name: row.name, email: row.email, role: row.role };
    startSession(req, res, user);
    res.json({ user });
  })
);

app.post('/api/logout', (req, res) => {
  res.clearCookie('sid', COOKIE_OPTS);
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ user: req.session.user || null });
});

// ---------- المنتجات (عام) ----------
const SORTS = { new: 'id DESC', price_asc: 'price ASC, id DESC', price_desc: 'price DESC, id DESC' };

app.get(
  '/api/products',
  wrap(async (req, res) => {
    const where = [];
    const params = [];
    if (CATEGORIES.includes(req.query.category)) {
      where.push('category = ?');
      params.push(req.query.category);
    }
    const q = String(req.query.q || '').trim().slice(0, 60);
    if (q) {
      const like = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
      where.push('(name LIKE ? OR name_en LIKE ? OR description LIKE ? OR description_en LIKE ?)');
      params.push(like, like, like, like);
    }
    if (req.query.instock === '1') where.push('quantity > 0');
    const order = SORTS[req.query.sort] || SORTS.new;
    const sql =
      'SELECT id, name, name_en, description, description_en, specs, specs_en, price, quantity, size, category, image FROM products' +
      (where.length ? ' WHERE ' + where.join(' AND ') : '') +
      ' ORDER BY ' + order;
    const [rows] = await getPool().query(sql, params);
    res.json({ products: rows.map(toProduct) });
  })
);

// ---------- السلة ----------
app.get(
  '/api/cart',
  requireAuth,
  wrap(async (req, res) => {
    const [rows] = await getPool().query(
      `SELECT c.product_id AS id, c.qty, p.name, p.name_en, p.price, p.image, p.size, p.quantity AS stock
       FROM cart_items c JOIN products p ON p.id = c.product_id
       WHERE c.user_id = ? ORDER BY c.id DESC`,
      [req.session.user.id]
    );
    const items = rows.map((r) => ({ ...r, price: Number(r.price) }));
    const total = items.reduce((s, i) => s + i.price * i.qty, 0);
    res.set('Cache-Control', 'no-store');
    res.json({ items, total });
  })
);

app.post(
  '/api/cart',
  requireAuth,
  wrap(async (req, res) => {
    const productId = posInt(req.body.productId);
    const qty = posInt(req.body.qty || 1);
    if (!productId || !qty || qty > 20) throw new UserError('بيانات غير صالحة');
    const pool = getPool();
    const [prod] = await pool.query('SELECT id, quantity FROM products WHERE id = ?', [productId]);
    if (!prod.length) throw new UserError('المنتج غير موجود', 404);
    const stock = prod[0].quantity;
    if (stock < 1) throw new UserError('المنتج غير متوفر حالياً');
    const uid = req.session.user.id;
    const [cur] = await pool.query('SELECT qty FROM cart_items WHERE user_id = ? AND product_id = ?', [
      uid,
      productId
    ]);
    if (cur.length) {
      const newQty = Math.min(cur[0].qty + qty, stock);
      await pool.query('UPDATE cart_items SET qty = ? WHERE user_id = ? AND product_id = ?', [
        newQty,
        uid,
        productId
      ]);
    } else {
      await pool.query('INSERT INTO cart_items (user_id, product_id, qty) VALUES (?, ?, ?)', [
        uid,
        productId,
        Math.min(qty, stock)
      ]);
    }
    res.json({ ok: true });
  })
);

app.delete(
  '/api/cart/:id',
  requireAuth,
  wrap(async (req, res) => {
    const id = posInt(req.params.id);
    if (!id) throw new UserError('بيانات غير صالحة');
    await getPool().query('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?', [
      req.session.user.id,
      id
    ]);
    res.json({ ok: true });
  })
);

app.patch(
  '/api/cart/:id',
  requireAuth,
  wrap(async (req, res) => {
    const id = posInt(req.params.id);
    const qty = posInt(req.body.qty);
    if (!id || !qty || qty > 20) throw new UserError('بيانات غير صالحة');
    const pool = getPool();
    const [prod] = await pool.query('SELECT quantity FROM products WHERE id = ?', [id]);
    if (!prod.length) throw new UserError('المنتج غير موجود', 404);
    const finalQty = Math.min(qty, prod[0].quantity);
    if (finalQty < 1) throw new UserError('المنتج غير متوفر حالياً');
    const [r] = await pool.query('UPDATE cart_items SET qty = ? WHERE user_id = ? AND product_id = ?', [
      finalQty,
      req.session.user.id,
      id
    ]);
    if (!r.affectedRows) throw new UserError('المنتج غير موجود', 404);
    res.json({ ok: true, qty: finalQty });
  })
);

app.get(
  '/api/orders',
  requireAuth,
  wrap(async (req, res) => {
    const pool = getPool();
    const [orders] = await pool.query(
      'SELECT id, total, payment_method, payment_status, status, created_at FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 100',
      [req.session.user.id]
    );
    let items = [];
    if (orders.length) {
      const [rows] = await pool.query('SELECT order_id, name, price, qty FROM order_items WHERE order_id IN (?)', [
        orders.map((o) => o.id)
      ]);
      items = rows;
    }
    res.set('Cache-Control', 'no-store');
    res.json({
      orders: orders.map((o) => ({
        ...o,
        total: Number(o.total),
        items: items.filter((i) => i.order_id === o.id).map((i) => ({ ...i, price: Number(i.price) }))
      }))
    });
  })
);

// ---------- الدفع / إنشاء الطلب ----------
app.post(
  '/api/checkout',
  requireAuth,
  wrap(async (req, res) => {
    const address = String(req.body.address || '').trim();
    const phone = String(req.body.phone || '').trim();
    const payment = String(req.body.payment || '');
    if (address.length < 5 || address.length > 300) throw new UserError('العنوان غير صالح');
    if (!PHONE_RE.test(phone)) throw new UserError('رقم الهاتف غير صالح');
    if (!PAYMENTS.includes(payment)) throw new UserError('اختر طريقة دفع صحيحة');
    const useStripe = payment === 'stripe';
    if (useStripe && !stripe.isEnabled()) throw new UserError('اختر طريقة دفع صحيحة');
    if (payment === 'card' && stripe.isEnabled()) throw new UserError('اختر طريقة دفع صحيحة');

    const uid = req.session.user.id;
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
      const [items] = await conn.query(
        `SELECT c.product_id, c.qty, p.name, p.name_en, p.price, p.quantity
         FROM cart_items c JOIN products p ON p.id = c.product_id
         WHERE c.user_id = ? FOR UPDATE`,
        [uid]
      );
      if (!items.length) throw new UserError('السلة فارغة');
      let total = 0;
      for (const it of items) {
        if (it.qty > it.quantity) {
          throw new UserError('الكمية المطلوبة غير متوفرة للمنتج: ' + it.name, 409);
        }
        total += Number(it.price) * it.qty;
      }
      const [o] = await conn.query(
        'INSERT INTO orders (user_id, total, payment_method, address, phone) VALUES (?, ?, ?, ?, ?)',
        [uid, total, payment, address, phone]
      );
      for (const it of items) {
        await conn.query(
          'INSERT INTO order_items (order_id, product_id, name, price, qty) VALUES (?, ?, ?, ?, ?)',
          [o.insertId, it.product_id, it.name, it.price, it.qty]
        );
        await conn.query('UPDATE products SET quantity = quantity - ? WHERE id = ?', [
          it.qty,
          it.product_id
        ]);
      }
      await conn.query('DELETE FROM cart_items WHERE user_id = ?', [uid]);
      await conn.commit();
      if (!useStripe) return res.json({ orderId: o.insertId, total });
      // دفع إلكتروني: ننشئ جلسة Stripe وبعدها نحوّل العميل لصفحة الدفع
      const order = { id: o.insertId, total };
      try {
        const sess = await stripe.createCheckoutSession({
          order,
          items: items.map((it) => ({ name: it.name_en || it.name, price: it.price, qty: it.qty })),
          email: req.session.user.email,
          siteUrl: siteUrl(req)
        });
        await getPool().query('UPDATE orders SET stripe_session_id = ? WHERE id = ?', [sess.id, order.id]);
        return res.json({ orderId: order.id, total, url: sess.url });
      } catch (e) {
        console.error('Stripe session error:', e.message);
        // نلغي الطلب ونعيد المخزون والسلة حتى لا يضيع شيء
        const c2 = await getPool().getConnection();
        try {
          await c2.beginTransaction();
          await c2.query("UPDATE orders SET status = 'cancelled' WHERE id = ?", [order.id]);
          for (const it of items) {
            await c2.query('UPDATE products SET quantity = quantity + ? WHERE id = ?', [it.qty, it.product_id]);
            await c2.query(
              'INSERT INTO cart_items (user_id, product_id, qty) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE qty = VALUES(qty)',
              [uid, it.product_id, it.qty]
            );
          }
          await c2.commit();
        } catch (e2) {
          try {
            await c2.rollback();
          } catch (e3) {
            /* تجاهل */
          }
        } finally {
          c2.release();
        }
        throw new UserError('تعذّر بدء الدفع الإلكتروني، حاول مرة أخرى', 502);
      }
    } catch (err) {
      try {
        await conn.rollback();
      } catch (e) {
        /* تجاهل */
      }
      throw err;
    } finally {
      conn.release();
    }
  })
);

function siteUrl(req) {
  const fixed = String(process.env.SITE_URL || '').trim().replace(/\/+$/, '');
  if (/^https?:\/\//.test(fixed)) return fixed;
  return req.protocol + '://' + req.get('host');
}

// إعادة محاولة الدفع لطلب غير مدفوع
app.post(
  '/api/orders/:id/pay',
  requireAuth,
  wrap(async (req, res) => {
    if (!stripe.isEnabled()) throw new UserError('الدفع الإلكتروني غير مفعّل');
    const id = posInt(req.params.id);
    if (!id) throw new UserError('بيانات غير صالحة');
    const pool = getPool();
    const [[order]] = await pool.query(
      "SELECT id, total, stripe_session_id FROM orders WHERE id = ? AND user_id = ? AND payment_method = 'stripe' AND payment_status = 'unpaid' AND status = 'pending'",
      [id, req.session.user.id]
    );
    if (!order) throw new UserError('الطلب غير متاح للدفع', 404);
    const [items] = await pool.query(
      'SELECT i.name, i.price, i.qty, p.name_en FROM order_items i LEFT JOIN products p ON p.id = i.product_id WHERE i.order_id = ?',
      [id]
    );
    const sess = await stripe.createCheckoutSession({
      order: { id: order.id, total: Number(order.total) },
      items: items.map((it) => ({ name: it.name_en || it.name, price: it.price, qty: it.qty })),
      email: req.session.user.email,
      siteUrl: siteUrl(req)
    });
    await pool.query('UPDATE orders SET stripe_session_id = ? WHERE id = ?', [sess.id, id]);
    if (order.stripe_session_id) await stripe.expireSession(order.stripe_session_id);
    res.json({ url: sess.url });
  })
);

// ---------- الأدمن ----------
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (EXT[file.mimetype]) return cb(null, true);
    cb(new UserError('نوع الصورة غير مدعوم (jpg / png / webp / gif)'));
  }
});

function looksLikeImage(buf, mime) {
  if (!buf || buf.length < 12) return false;
  if (mime === 'image/jpeg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (mime === 'image/png') return buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === 'image/gif') return buf.subarray(0, 4).toString('latin1') === 'GIF8';
  if (mime === 'image/webp') {
    return buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP';
  }
  return false;
}

// يحفظ الصورة: Vercel Blob لو متاح، وإلا القرص المحلي (للتشغيل المحلي)
async function saveImage(file) {
  if (!looksLikeImage(file.buffer, file.mimetype)) {
    throw new UserError('نوع الصورة غير مدعوم (jpg / png / webp / gif)');
  }
  const name = crypto.randomBytes(16).toString('hex') + EXT[file.mimetype];
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import('@vercel/blob');
    const blob = await put('products/' + name, file.buffer, {
      access: 'public',
      contentType: file.mimetype,
      addRandomSuffix: false
    });
    return blob.url;
  }
  if (IS_VERCEL) throw new UserError('تخزين الصور غير مفعّل على السيرفر', 500);
  await fs.promises.writeFile(path.join(UPLOADS_DIR, name), file.buffer);
  return '/uploads/' + name;
}

async function removeUploadedFile(url) {
  if (typeof url !== 'string') return;
  try {
    if (/^https:\/\/[^/]+\.blob\.vercel-storage\.com\//.test(url)) {
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        const { del } = await import('@vercel/blob');
        await del(url);
      }
      return;
    }
    if (!url.startsWith('/uploads/')) return;
    const name = path.basename(url);
    if (name === 'placeholder.svg') return;
    await fs.promises.unlink(path.join(UPLOADS_DIR, name));
  } catch (e) { /* تجاهل */ }
}

app.get(
  '/api/admin/products',
  requireAdmin,
  wrap(async (req, res) => {
    const [rows] = await getPool().query(
      'SELECT id, name, name_en, description, description_en, specs, specs_en, price, quantity, size, category, image FROM products ORDER BY id DESC'
    );
    res.json({ products: rows.map(toProduct) });
  })
);

function readProductFields(body) {
  const str = (v) => String(v == null ? '' : v).trim();
  const f = {
    name: str(body.name),
    name_en: str(body.name_en),
    description: str(body.description),
    description_en: str(body.description_en),
    specs: str(body.specs),
    specs_en: str(body.specs_en),
    size: str(body.size),
    category: str(body.category),
    price: Number(body.price),
    quantity: Number(body.quantity)
  };
  if (!f.name || f.name.length > 150 || f.name_en.length > 150) {
    throw new UserError('اسم المنتج مطلوب (حتى 150 حرفاً)');
  }
  if ([f.description, f.description_en, f.specs, f.specs_en].some((t) => t.length > 2000)) {
    throw new UserError('النص طويل جداً');
  }
  if (f.size.length > 100) throw new UserError('المقاس طويل جداً');
  if (!CATEGORIES.includes(f.category)) throw new UserError('اختر القسم');
  if (!Number.isFinite(f.price) || f.price <= 0 || f.price > 10000000) throw new UserError('السعر غير صالح');
  if (!Number.isInteger(f.quantity) || f.quantity < 0 || f.quantity > 1000000) {
    throw new UserError('الكمية غير صالحة');
  }
  return f;
}

app.post(
  '/api/admin/products',
  requireAdmin,
  upload.single('image'),
  wrap(async (req, res) => {
    const f = readProductFields(req.body);
    const uploaded = req.file ? await saveImage(req.file) : null;
    try {
      const [r] = await getPool().query(
        `INSERT INTO products (name, name_en, description, description_en, specs, specs_en, price, quantity, size, category, image)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          f.name, f.name_en || null, f.description, f.description_en || null, f.specs, f.specs_en || null,
          f.price, f.quantity, f.size, f.category, uploaded || '/uploads/placeholder.svg'
        ]
      );
      res.json({ id: r.insertId });
    } catch (err) {
      if (uploaded) await removeUploadedFile(uploaded);
      throw err;
    }
  })
);

app.put(
  '/api/admin/products/:id',
  requireAdmin,
  upload.single('image'),
  wrap(async (req, res) => {
    const id = posInt(req.params.id);
    if (!id) throw new UserError('بيانات غير صالحة');
    const pool = getPool();
    const [rows] = await pool.query('SELECT image FROM products WHERE id = ?', [id]);
    if (!rows.length) throw new UserError('المنتج غير موجود', 404);
    const f = readProductFields(req.body);
    const uploaded = req.file ? await saveImage(req.file) : null;
    try {
      await pool.query(
        `UPDATE products SET name = ?, name_en = ?, description = ?, description_en = ?, specs = ?, specs_en = ?,
           price = ?, quantity = ?, size = ?, category = ?, image = ? WHERE id = ?`,
        [
          f.name, f.name_en || null, f.description, f.description_en || null, f.specs, f.specs_en || null,
          f.price, f.quantity, f.size, f.category, uploaded || rows[0].image, id
        ]
      );
    } catch (err) {
      if (uploaded) await removeUploadedFile(uploaded);
      throw err;
    }
    if (uploaded) await removeUploadedFile(rows[0].image);
    res.json({ ok: true });
  })
);

app.get(
  '/api/admin/stats',
  requireAdmin,
  wrap(async (req, res) => {
    const pool = getPool();
    const [[o]] = await pool.query(
      `SELECT COUNT(*) AS orders,
              COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN total ELSE 0 END), 0) AS revenue,
              COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pending
       FROM orders`
    );
    const [[p]] = await pool.query(
      'SELECT COUNT(*) AS products, COALESCE(SUM(CASE WHEN quantity <= 5 THEN 1 ELSE 0 END), 0) AS low FROM products'
    );
    const [[c]] = await pool.query("SELECT COUNT(*) AS customers FROM users WHERE role = 'customer'");
    res.set('Cache-Control', 'no-store');
    res.json({
      orders: Number(o.orders),
      revenue: Number(o.revenue),
      pending: Number(o.pending),
      products: Number(p.products),
      lowStock: Number(p.low),
      customers: Number(c.customers)
    });
  })
);

app.delete(
  '/api/admin/products/:id',
  requireAdmin,
  wrap(async (req, res) => {
    const id = posInt(req.params.id);
    if (!id) throw new UserError('بيانات غير صالحة');
    const pool = getPool();
    const [rows] = await pool.query('SELECT image FROM products WHERE id = ?', [id]);
    if (!rows.length) throw new UserError('المنتج غير موجود', 404);
    await pool.query('DELETE FROM products WHERE id = ?', [id]);
    await removeUploadedFile(rows[0].image);
    res.json({ ok: true });
  })
);

app.get(
  '/api/admin/orders',
  requireAdmin,
  wrap(async (req, res) => {
    const pool = getPool();
    const [orders] = await pool.query(
      `SELECT o.id, o.total, o.payment_method, o.payment_status, o.address, o.phone, o.status, o.created_at,
              u.name AS customer, u.email
       FROM orders o JOIN users u ON u.id = o.user_id
       ORDER BY o.id DESC LIMIT 200`
    );
    let items = [];
    if (orders.length) {
      const [rows] = await pool.query(
        'SELECT order_id, name, price, qty FROM order_items WHERE order_id IN (?)',
        [orders.map((o) => o.id)]
      );
      items = rows;
    }
    const result = orders.map((o) => ({
      ...o,
      total: Number(o.total),
      items: items.filter((i) => i.order_id === o.id).map((i) => ({ ...i, price: Number(i.price) }))
    }));
    res.json({ orders: result });
  })
);

app.patch(
  '/api/admin/orders/:id',
  requireAdmin,
  wrap(async (req, res) => {
    const id = posInt(req.params.id);
    const status = String(req.body.status || '');
    if (!id || !STATUSES.includes(status)) throw new UserError('بيانات غير صالحة');
    const pool = getPool();
    const [r] = await pool.query('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
    if (!r.affectedRows) throw new UserError('الطلب غير موجود', 404);
    // إيميل "تم الشحن": مرة واحدة فقط لكل طلب، وفشله لا يمنع تحديث الحالة
    let email = 'skipped';
    if (status === 'shipped' && mailer.isEnabled()) {
      // نحجز الإرسال أولاً (ذرّي) لمنع التكرار لو اتضغط مرتين
      const [claim] = await pool.query('UPDATE orders SET shipped_email_sent = 1 WHERE id = ? AND shipped_email_sent = 0', [id]);
      if (claim.affectedRows === 1) {
        try {
          const [[o]] = await pool.query(
            'SELECT o.id, o.total, u.name, u.email FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = ?',
            [id]
          );
          const [items] = await pool.query('SELECT name, qty FROM order_items WHERE order_id = ?', [id]);
          await mailer.sendShipped({
            order: { id: o.id, total: Number(o.total) },
            items,
            customer: { name: o.name, email: o.email },
            currency: stripe.currency(),
            siteUrl: siteUrl(req)
          });
          email = 'sent';
        } catch (e) {
          console.error('Shipped email failed:', e.message);
          await pool.query('UPDATE orders SET shipped_email_sent = 0 WHERE id = ?', [id]); // يسمح بإعادة المحاولة
          email = 'failed';
        }
      } else {
        email = 'already';
      }
    }
    res.json({ ok: true, email });
  })
);

// ---------- الأخطاء ----------
app.use('/api', (req, res) => res.status(404).json({ error: 'غير موجود' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof UserError) return res.status(err.status).json({ error: err.message });
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'حجم الصورة أكبر من 3 ميجا' : 'خطأ في رفع الصورة';
    return res.status(400).json({ error: msg });
  }
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'بيانات غير صالحة' });
  console.error(err);
  res.status(500).json({ error: 'حدث خطأ في السيرفر' });
});

// ---------- التشغيل ----------
if (require.main === module) {
  // تشغيل محلي: npm start
  readyPromise = init();
  readyPromise
    .then(() => {
      app.listen(PORT, HOST, () => {
        console.log('السيرفر يعمل على: http://localhost:' + PORT);
      });
    })
    .catch((err) => {
      console.error('Could not connect to the database. Check DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_SSL in your .env file.');
      console.error(err.message);
      process.exit(1);
    });
}

// على Vercel يُستورد التطبيق من api/index.js
module.exports = app;
