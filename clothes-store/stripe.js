'use strict';
// Stripe Checkout (hosted payment page) — no card data ever touches this server.
// Uses Stripe's REST API directly (no extra npm dependency) and Node's built-in fetch.
const crypto = require('crypto');

const API = 'https://api.stripe.com/v1';
// Currencies that Stripe treats as having no minor unit
const ZERO_DECIMAL = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'
]);

let fetchImpl = (...args) => fetch(...args);
function setFetch(fn) {
  fetchImpl = fn;
}

function secretKey() {
  return String(process.env.STRIPE_SECRET_KEY || '').trim();
}

function isEnabled() {
  return /^(sk|rk)_(test|live)_/.test(secretKey()) && Boolean(process.env.STRIPE_WEBHOOK_SECRET);
}

function currency() {
  const c = String(process.env.STORE_CURRENCY || 'USD').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(c) ? c : 'USD';
}

// 12.34 USD -> 1234 ; 500 JPY -> 500
function toMinor(amount, cur) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n < 0) throw new Error('Invalid amount');
  return ZERO_DECIMAL.has(String(cur).toUpperCase()) ? Math.round(n) : Math.round(n * 100);
}

function form(params) {
  const body = new URLSearchParams();
  for (const [k, v] of params) body.append(k, String(v));
  return body.toString();
}

async function call(method, path, params) {
  const res = await fetchImpl(API + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + secretKey(),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params ? form(params) : undefined
  });
  let data = {};
  try {
    data = await res.json();
  } catch (e) {
    /* غير JSON */
  }
  if (!res.ok) {
    const msg = data && data.error && data.error.message ? data.error.message : 'Stripe error ' + res.status;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

/**
 * order: { id, total }   items: [{ name, price, qty }]
 * Returns { id, url }
 */
async function createCheckoutSession({ order, items, email, siteUrl }) {
  const cur = currency();
  const p = [
    ['mode', 'payment'],
    ['success_url', siteUrl + '/orders.html?paid=1&order=' + order.id],
    ['cancel_url', siteUrl + '/orders.html?cancelled=1&order=' + order.id],
    ['client_reference_id', order.id],
    ['metadata[order_id]', order.id],
    ['payment_intent_data[metadata][order_id]', order.id],
    ['expires_at', Math.floor(Date.now() / 1000) + 31 * 60]
  ];
  if (email) p.push(['customer_email', email]);
  items.forEach((it, i) => {
    p.push(['line_items[' + i + '][quantity]', it.qty]);
    p.push(['line_items[' + i + '][price_data][currency]', cur.toLowerCase()]);
    p.push(['line_items[' + i + '][price_data][unit_amount]', toMinor(it.price, cur)]);
    p.push(['line_items[' + i + '][price_data][product_data][name]', String(it.name).slice(0, 200)]);
  });
  const s = await call('POST', '/checkout/sessions', p);
  if (!s.id || !s.url) throw new Error('Stripe did not return a checkout URL');
  return { id: s.id, url: s.url };
}

async function expireSession(id) {
  try {
    await call('POST', '/checkout/sessions/' + encodeURIComponent(id) + '/expire', []);
  } catch (e) {
    /* already completed or expired */
  }
}

/**
 * Verifies the Stripe-Signature header. rawBody must be the exact request bytes (Buffer or string).
 * Returns the parsed event, or throws.
 */
function verifyWebhook(rawBody, header, secret, toleranceSec, nowMs) {
  const tol = toleranceSec == null ? 300 : toleranceSec;
  const now = nowMs == null ? Date.now() : nowMs;
  if (!header || !secret) throw new Error('Missing signature');
  const parts = String(header).split(',').map((x) => x.trim());
  const t = (parts.find((x) => x.startsWith('t=')) || '').slice(2);
  const sigs = parts.filter((x) => x.startsWith('v1=')).map((x) => x.slice(3));
  if (!t || !sigs.length) throw new Error('Malformed signature header');
  const payload = Buffer.concat([Buffer.from(t + '.'), Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody))]);
  const expected = crypto.createHmac('sha256', secret).update(payload).digest();
  const ok = sigs.some((s) => {
    const got = Buffer.from(s, 'hex');
    return got.length === expected.length && crypto.timingSafeEqual(got, expected);
  });
  if (!ok) throw new Error('Signature mismatch');
  if (Math.abs(now / 1000 - Number(t)) > tol) throw new Error('Timestamp outside tolerance');
  return JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody));
}

module.exports = { isEnabled, currency, toMinor, createCheckoutSession, expireSession, verifyWebhook, setFetch };
