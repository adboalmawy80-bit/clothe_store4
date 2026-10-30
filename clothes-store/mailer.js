'use strict';
// Transactional email. Two providers, pick one via env:
//   1) Resend (HTTP API, easiest on Vercel):  RESEND_API_KEY + MAIL_FROM
//   2) Any SMTP server (Gmail, Brevo, Mailgun...): SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS + MAIL_FROM
const STORE_NAME = () => String(process.env.STORE_NAME || 'Elegance Store | متجر الأناقة');

let fetchImpl = (...a) => fetch(...a);
let smtpFactory = null; // injectable for tests
function setFetch(fn) { fetchImpl = fn; }
function setSmtpFactory(fn) { smtpFactory = fn; }

function provider() {
  if (!String(process.env.MAIL_FROM || '').trim()) return null;
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) return 'smtp';
  return null;
}
const isEnabled = () => provider() !== null;

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function send({ to, subject, html, text }) {
  const from = String(process.env.MAIL_FROM).trim();
  const p = provider();
  if (p === 'resend') {
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html, text })
    });
    if (!res.ok) {
      let m = '';
      try { m = (await res.json()).message || ''; } catch (e) { /* ignore */ }
      throw new Error('Resend error ' + res.status + (m ? ': ' + m : ''));
    }
    return true;
  }
  if (p === 'smtp') {
    const port = Number(process.env.SMTP_PORT) || 587;
    const opts = {
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    };
    const tr = smtpFactory ? smtpFactory(opts) : require('nodemailer').createTransport(opts);
    await tr.sendMail({ from, to, subject, html, text });
    return true;
  }
  throw new Error('Email is not configured');
}

/** order: { id, total }, items: [{name, qty}], customer: {name, email}, currency */
function shippedMessage({ order, items, customer, currency, siteUrl }) {
  const store = STORE_NAME();
  let total = String(order.total);
  try { total = new Intl.NumberFormat('en', { style: 'currency', currency }).format(Number(order.total)); } catch (e) { /* ignore */ }
  const list = items.map((i) => '• ' + i.name + ' × ' + i.qty).join('\n');
  const li = items.map((i) => '<li>' + esc(i.name) + ' × ' + esc(i.qty) + '</li>').join('');
  const link = siteUrl ? siteUrl + '/orders.html' : '';
  const subject = 'تم شحن طلبك #' + order.id + ' | Your order #' + order.id + ' has shipped';
  const text =
    'مرحباً ' + customer.name + '،\nتم شحن طلبك رقم #' + order.id + ' وهو في الطريق إليك.\n' + list + '\nالإجمالي: ' + total +
    (link ? '\nتابع طلباتك: ' + link : '') + '\n\n— ' + store +
    '\n\n----\n\nHello ' + customer.name + ',\nYour order #' + order.id + ' has been shipped and is on its way.\n' + list +
    '\nTotal: ' + total + (link ? '\nTrack your orders: ' + link : '') + '\n\n— ' + store;
  const html =
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;color:#14182b">' +
    '<h2 style="margin:0 0 12px">📦 ' + esc(store) + '</h2>' +
    '<div dir="rtl" style="text-align:right;margin-bottom:20px"><p>مرحباً ' + esc(customer.name) + '،</p>' +
    '<p>تم شحن طلبك رقم <strong>#' + esc(order.id) + '</strong> وهو في الطريق إليك.</p></div>' +
    '<div dir="ltr" style="text-align:left"><p>Hello ' + esc(customer.name) + ',</p>' +
    '<p>Your order <strong>#' + esc(order.id) + '</strong> has been shipped and is on its way.</p></div>' +
    '<ul>' + li + '</ul><p><strong>' + esc(total) + '</strong></p>' +
    (link ? '<p><a href="' + esc(link) + '" style="background:#f4c430;color:#14182b;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">My orders / طلباتي</a></p>' : '') +
    '</div>';
  return { subject, html, text };
}

async function sendShipped(args) {
  const m = shippedMessage(args);
  return send({ to: args.customer.email, ...m });
}

module.exports = { isEnabled, provider, send, sendShipped, shippedMessage, setFetch, setSmtpFactory };
