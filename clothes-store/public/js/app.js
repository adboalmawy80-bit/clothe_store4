(function () {
  'use strict';

  const I = window.I18n;
  const t = I.t;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const loc = (o, f) => (I.lang === 'en' && o[f + '_en'] ? o[f + '_en'] : o[f]);
  // إعدادات المتجر (العملة + هل Stripe مفعّل) من السيرفر
  const cfg = { currency: 'USD', stripe: false };
  const ready = fetch('/api/config', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : null))
    .then((c) => { if (c && /^[A-Z]{3}$/.test(c.currency)) { cfg.currency = c.currency; cfg.stripe = !!c.stripe; } })
    .catch(() => {});
  const money = (n) => {
    try {
      return new Intl.NumberFormat(I.locale, { style: 'currency', currency: cfg.currency }).format(Number(n));
    } catch (e) {
      return Number(n).toLocaleString(I.locale, { maximumFractionDigits: 2 }) + ' ' + cfg.currency;
    }
  };
  const PLACEHOLDER = '/uploads/placeholder.svg';

  async function api(url, opts) {
    const o = Object.assign({ credentials: 'same-origin', headers: {} }, opts || {});
    if (o.body && !(o.body instanceof FormData)) {
      o.headers['Content-Type'] = 'application/json';
      o.body = JSON.stringify(o.body);
    }
    const res = await fetch(url, o);
    let data = {};
    try { data = await res.json(); } catch (e) { /* لا يوجد JSON */ }
    if (!res.ok) {
      const err = new Error(I.err(data.error));
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function toast(msg, type) {
    let el = $('#toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = 'show ' + (type || '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.className = ''; }, 3200);
  }

  function safeNext() {
    const n = new URLSearchParams(location.search).get('next');
    return n && /^\/(?!\/)[A-Za-z0-9_\-./]*$/.test(n) ? n : null;
  }

  function fixImages(root) {
    $$('img[data-img]', root).forEach((img) => {
      img.addEventListener('error', () => {
        if (!img.src.endsWith(PLACEHOLDER)) img.src = PLACEHOLDER;
      });
    });
  }

  window.Store = { api, esc, money, toast, fixImages, ready, cfg };

  // ---------- الوضع الليلي ----------
  function getTheme() {
    try { return localStorage.getItem('theme') || 'dark'; } catch (e) { return 'dark'; }
  }
  function setTheme(v) {
    document.documentElement.setAttribute('data-theme', v);
    try { localStorage.setItem('theme', v); } catch (e) { /* تجاهل */ }
  }
  setTheme(getTheme());

  // ---------- الهيدر ----------
  function renderNav(user, cartCount) {
    const h = $('#site-header');
    if (!h) return;
    const path = location.pathname;
    const link = (href, text, extra) =>
      '<a href="' + href + '" class="' + (path === href ? 'active' : '') + '">' + text + (extra || '') + '</a>';
    let links =
      link('/', t('nav.home')) +
      link('/men.html', t('nav.men')) +
      link('/kids.html', t('nav.kids')) +
      link('/women.html', t('nav.women')) +
      link('/cart.html', t('nav.cart'), cartCount > 0 ? '<span class="badge">' + cartCount + '</span>' : '');
    if (user) links += link('/orders.html', t('nav.orders'));
    if (user && user.role === 'admin') links += link('/admin', t('nav.admin'));
    links += user
      ? '<span class="hello">' + esc(t('nav.hello', { name: user.name })) + '</span><button id="logout-btn" class="btn-link" type="button">' + t('nav.logout') + '</button>'
      : link('/login.html', t('nav.login'));

    h.innerHTML =
      '<div class="nav-inner">' +
      '<a class="brand" href="/">' + t('brand') + '</a>' +
      '<button id="menu-btn" class="icon-btn menu-btn" type="button" aria-label="' + t('nav.menu') + '">☰</button>' +
      '<nav id="nav-links">' + links + '</nav>' +
      '<button id="lang-btn" class="icon-btn" type="button" aria-label="' + t('nav.lang') + '" title="' + t('nav.lang') + '">' + I.shortOf(I.other()) + '</button>' +
      '<button id="theme-btn" class="icon-btn" type="button" aria-label="' + t('nav.theme') + '"></button>' +
      '</div>';

    const themeBtn = $('#theme-btn');
    const paint = () => { themeBtn.textContent = getTheme() === 'dark' ? '☀️' : '🌙'; };
    paint();
    themeBtn.addEventListener('click', () => {
      setTheme(getTheme() === 'dark' ? 'light' : 'dark');
      paint();
    });
    $('#lang-btn').addEventListener('click', () => I.setLang(I.other()));
    $('#menu-btn').addEventListener('click', () => $('#nav-links').classList.toggle('open'));
    const lo = $('#logout-btn');
    if (lo) {
      lo.addEventListener('click', async () => {
        try { await api('/api/logout', { method: 'POST' }); } catch (e) { /* تجاهل */ }
        location.href = '/';
      });
    }
  }

  // ---------- صفحات الأقسام (بحث + ترتيب + فلتر) ----------
  async function pageCategory() {
    const grid = $('#products');
    const cat = document.body.dataset.category;

    const bar = document.createElement('form');
    bar.className = 'toolbar';
    bar.setAttribute('role', 'search');
    bar.innerHTML =
      '<input type="search" id="f-q" maxlength="60" autocomplete="off" placeholder="' + esc(t('f.searchPh')) + '" aria-label="' + esc(t('f.search')) + '">' +
      '<select id="f-sort" aria-label="' + esc(t('f.sort')) + '">' +
      '<option value="new">' + esc(t('f.sortNew')) + '</option>' +
      '<option value="price_asc">' + esc(t('f.sortLow')) + '</option>' +
      '<option value="price_desc">' + esc(t('f.sortHigh')) + '</option></select>' +
      '<label class="check"><input type="checkbox" id="f-stock"> <span>' + esc(t('f.instock')) + '</span></label>';
    const count = document.createElement('p');
    count.className = 'muted';
    count.id = 'f-count';
    count.setAttribute('aria-live', 'polite');
    grid.parentNode.insertBefore(bar, grid);
    grid.parentNode.insertBefore(count, grid);
    bar.addEventListener('submit', (ev) => ev.preventDefault());

    function render(list, filtered) {
      count.textContent = list.length ? t('f.count', { n: list.length }) : '';
      if (!list.length) {
        grid.innerHTML = '<p class="empty">' + t(filtered ? 'p.noMatch' : 'prod.none') + '</p>';
        return;
      }
      grid.innerHTML = list
        .map(
          (p) =>
            '<article class="card">' +
            '<img data-img src="' + esc(p.image) + '" alt="' + esc(loc(p, 'name')) + '" loading="lazy">' +
            '<div class="card-body">' +
            '<h3>' + esc(loc(p, 'name')) + '</h3>' +
            '<p class="desc">' + esc(loc(p, 'description')) + '</p>' +
            (loc(p, 'specs') ? '<p class="desc">' + esc(loc(p, 'specs')) + '</p>' : '') +
            '<ul class="specs"><li>' + t('prod.size') + ': ' + esc(p.size || '—') + '</li><li>' + t('prod.stock') + ': ' + esc(p.quantity) + '</li></ul>' +
            '<div class="price">' + money(p.price) + '</div>' +
            '<button class="btn" type="button" data-id="' + esc(p.id) + '"' + (p.quantity < 1 ? ' disabled' : '') + '>' +
            (p.quantity < 1 ? t('prod.soldout') : t('prod.buy')) + '</button>' +
            '</div></article>'
        )
        .join('');
      fixImages(grid);
    }

    let seq = 0;
    async function load() {
      const my = ++seq;
      const qs = new URLSearchParams({ category: cat, sort: $('#f-sort').value });
      const q = $('#f-q').value.trim();
      if (q) qs.set('q', q);
      const inStock = $('#f-stock').checked;
      if (inStock) qs.set('instock', '1');
      try {
        const data = await api('/api/products?' + qs.toString());
        if (my === seq) render(data.products, Boolean(q) || inStock);
      } catch (e) {
        if (my === seq) toast(e.message, 'error');
      }
    }

    let timer = null;
    bar.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(load, 250);
    });

    grid.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('button[data-id]');
      if (!btn) return;
      btn.disabled = true;
      try {
        await api('/api/cart', { method: 'POST', body: { productId: Number(btn.dataset.id), qty: 1 } });
        location.href = '/cart.html';
      } catch (e) {
        if (e.status === 401) {
          location.href = '/login.html?next=' + encodeURIComponent(location.pathname);
        } else {
          toast(e.message, 'error');
          btn.disabled = false;
        }
      }
    });

    await load();
  }

  // ---------- السلة ----------
  async function pageCart() {
    const box = $('#cart-box');
    let data;
    try {
      data = await api('/api/cart');
    } catch (e) {
      if (e.status === 401) { location.href = '/login.html?next=/cart.html'; return; }
      throw e;
    }
    if (!data.items.length) {
      box.innerHTML = '<p class="empty">' + t('cart.empty') + ' <a href="/">' + t('cart.browse') + '</a></p>';
      return;
    }
    box.innerHTML =
      data.items
        .map(
          (i) =>
            '<div class="cart-row">' +
            '<img data-img src="' + esc(i.image) + '" alt="' + esc(loc(i, 'name')) + '">' +
            '<div><h3>' + esc(loc(i, 'name')) + '</h3><div class="muted">' + t('prod.size') + ': ' + esc(i.size || '—') + '</div>' +
            '<div class="qty" role="group" aria-label="' + esc(t('cart.qty')) + '">' +
            '<button type="button" class="icon-btn" data-qty="' + esc(i.id) + '" data-to="' + (i.qty - 1) + '" aria-label="' + esc(t('cart.dec')) + '"' + (i.qty <= 1 ? ' disabled' : '') + '>−</button>' +
            '<span aria-live="polite">' + esc(i.qty) + '</span>' +
            '<button type="button" class="icon-btn" data-qty="' + esc(i.id) + '" data-to="' + (i.qty + 1) + '" aria-label="' + esc(t('cart.inc')) + '"' + (i.qty >= Math.min(i.stock, 20) ? ' disabled' : '') + '>+</button>' +
            '</div></div>' +
            '<strong>' + money(i.price * i.qty) + '</strong>' +
            '<button class="btn danger small" type="button" data-del="' + esc(i.id) + '">' + t('cart.del') + '</button>' +
            '</div>'
        )
        .join('') +
      '<div class="total-row"><span>' + t('cart.total') + ': ' + money(data.total) + '</span>' +
      '<a class="btn" href="/checkout.html">' + t('cart.checkout') + '</a></div>';
    fixImages(box);
    $$('button[data-qty]', box).forEach((b) =>
      b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          await api('/api/cart/' + encodeURIComponent(b.dataset.qty), { method: 'PATCH', body: { qty: Number(b.dataset.to) } });
          location.reload();
        } catch (e) {
          toast(e.message, 'error');
          b.disabled = false;
        }
      })
    );
    $$('button[data-del]', box).forEach((b) =>
      b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          await api('/api/cart/' + encodeURIComponent(b.dataset.del), { method: 'DELETE' });
          location.reload();
        } catch (e) {
          toast(e.message, 'error');
          b.disabled = false;
        }
      })
    );
  }

  // ---------- صفحة الدفع ----------
  async function pageCheckout() {
    const box = $('#checkout-box');
    let data;
    try {
      data = await api('/api/cart');
    } catch (e) {
      if (e.status === 401) { location.href = '/login.html?next=/checkout.html'; return; }
      throw e;
    }
    if (!data.items.length) {
      box.innerHTML = '<p class="empty">' + t('cart.empty') + ' <a href="/">' + t('cart.browse') + '</a></p>';
      return;
    }
    $('#summary').innerHTML =
      data.items
        .map((i) => '<div class="total-row" style="font-size:1rem;font-weight:500;padding:4px 0"><span>' + esc(loc(i, 'name')) + ' × ' + esc(i.qty) + '</span><span>' + money(i.price * i.qty) + '</span></div>')
        .join('') +
      '<div class="total-row"><span>' + t('cart.total') + '</span><span>' + money(data.total) + '</span></div>';

    const form = $('#checkout-form');
    const note = $('#pay-note');
    if (cfg.stripe) {
      $('#opt-card').hidden = true;
      $('#opt-stripe').hidden = false;
      $('input[value=stripe]', form).checked = true;
    }
    const syncNote = () => {
      const k = new FormData(form).get('payment') === 'stripe' ? 'co.noteStripe' : 'co.note';
      note.setAttribute('data-i18n', k);
      note.textContent = t(k);
    };
    form.addEventListener('change', syncNote);
    syncNote();
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const msg = $('#checkout-msg');
      msg.textContent = '';
      const btn = $('button[type=submit]', form);
      btn.disabled = true;
      const body = Object.fromEntries(new FormData(form).entries());
      try {
        const r = await api('/api/checkout', { method: 'POST', body });
        if (r.url) { location.href = r.url; return; }
        box.innerHTML =
          '<div class="success"><div class="big">✅</div><h2>' + t('co.done') + '</h2>' +
          '<p>' + t('co.orderNo') + ': <strong>#' + esc(r.orderId) + '</strong> — ' + t('cart.total') + ': ' + money(r.total) + '</p>' +
          '<a class="btn" href="/">' + t('co.continue') + '</a></div>';
      } catch (e) {
        msg.textContent = e.message;
        btn.disabled = false;
      }
    });
  }

  // ---------- طلباتي ----------
  async function pageOrders() {
    const box = $('#orders-box');
    let data;
    try {
      data = await api('/api/orders');
    } catch (e) {
      if (e.status === 401) { location.href = '/login.html?next=/orders.html'; return; }
      throw e;
    }
    const qs = new URLSearchParams(location.search);
    const banner = qs.get('paid') ? '<p class="msg ok" role="status">' + t('orders.paidOk') + '</p>'
      : qs.get('cancelled') ? '<p class="msg" role="status">' + t('orders.cancelledPay') + '</p>' : '';
    if (!data.orders.length) {
      box.innerHTML = '<p class="empty">' + t('orders.none') + ' <a href="/">' + t('cart.browse') + '</a></p>';
      return;
    }
    box.innerHTML = banner + data.orders
      .map(
        (o) =>
          '<article class="order">' +
          '<header><strong>#' + esc(o.id) + '</strong>' +
          '<span class="status s-' + esc(o.status) + '">' + esc(t('status.' + o.status)) + '</span>' +
          '<time class="muted">' + esc(new Date(o.created_at).toLocaleDateString(I.locale)) + '</time></header>' +
          '<ul class="order-items">' + o.items.map((i) => '<li>' + esc(i.name) + ' × ' + esc(i.qty) + '</li>').join('') + '</ul>' +
          '<div class="total-row"><span>' + t('cart.total') + ': ' + money(o.total) + '</span>' +
          '<span class="muted">' + esc(t('pay.' + o.payment_method)) +
          (o.payment_method === 'stripe' ? ' · <span class="status ' + (o.payment_status === 'paid' ? 's-delivered' : 's-pending') + '">' + esc(t('pay.' + o.payment_status)) + '</span>' : '') +
          '</span></div>' +
          (o.payment_method === 'stripe' && o.payment_status === 'unpaid' && o.status === 'pending'
            ? '<button class="btn pay-now" data-id="' + esc(o.id) + '" type="button">' + t('orders.payNow') + '</button>' : '') +
          '</article>'
      )
      .join('');
    $$('.pay-now', box).forEach((b) =>
      b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          const r = await api('/api/orders/' + encodeURIComponent(b.dataset.id) + '/pay', { method: 'POST' });
          location.href = r.url;
        } catch (e) {
          toast(e.message, 'error');
          b.disabled = false;
        }
      })
    );
  }

  // ---------- تسجيل الدخول ----------
  function pageLogin(user) {
    if (user) {
      location.href = safeNext() || (user.role === 'admin' ? '/admin' : '/');
      return;
    }
    const loginForm = $('#login-form');
    const regForm = $('#register-form');
    const msg = $('#auth-msg');
    $$('.tabs button').forEach((b) =>
      b.addEventListener('click', () => {
        $$('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
        const isLogin = b.dataset.tab === 'login';
        loginForm.hidden = !isLogin;
        regForm.hidden = isLogin;
        msg.textContent = '';
      })
    );
    async function submit(form, url) {
      msg.textContent = '';
      const body = Object.fromEntries(new FormData(form).entries());
      try {
        const r = await api(url, { method: 'POST', body });
        location.href = safeNext() || (r.user.role === 'admin' ? '/admin' : '/');
      } catch (e) {
        msg.textContent = e.message;
      }
    }
    loginForm.addEventListener('submit', (ev) => { ev.preventDefault(); submit(loginForm, '/api/login'); });
    regForm.addEventListener('submit', (ev) => { ev.preventDefault(); submit(regForm, '/api/register'); });
  }

  // ---------- التشغيل ----------
  async function boot() {
    await ready;
    let user = null;
    let count = 0;
    try {
      user = (await api('/api/me')).user;
      if (user) count = (await api('/api/cart')).items.length;
    } catch (e) { /* تجاهل */ }
    renderNav(user, count);
    if (!$('.skip')) {
      const sk = document.createElement('a');
      sk.className = 'skip'; sk.href = '#main'; sk.textContent = t('nav.skip');
      document.body.insertBefore(sk, document.body.firstChild);
    }
    const page = document.body.dataset.page;
    try {
      if (page === 'category') await pageCategory();
      else if (page === 'cart') await pageCart();
      else if (page === 'checkout') await pageCheckout();
      else if (page === 'orders') await pageOrders();
      else if (page === 'login') pageLogin(user);
    } catch (e) {
      toast(e.message || t('err.generic'), 'error');
    }
  }
  boot();
})();
