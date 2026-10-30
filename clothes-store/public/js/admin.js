(function () {
  'use strict';

  const { api, esc, money, toast, fixImages, ready } = window.Store;
  const t = window.I18n.t;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const catName = (c) => t('nav.' + c);
  let cache = [];
  let editingId = null;
  const STATUS_KEYS = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];

  function handle(e) {
    if (e.status === 401 || e.status === 403) {
      location.href = '/login.html?next=/admin';
      return;
    }
    toast(e.message || t('err.generic'), 'error');
  }

  async function loadProducts() {
    const body = $('#products-body');
    try {
      const { products } = await api('/api/admin/products');
      if (!products.length) {
        body.innerHTML = '<tr><td colspan="7" class="empty">' + t('admin.noProducts') + '</td></tr>';
        return;
      }
      cache = products;
      body.innerHTML = products
        .map(
          (p) =>
            '<tr>' +
            '<td><img data-img src="' + esc(p.image) + '" alt=""></td>' +
            '<td>' + esc(p.name) + (p.name_en ? '<div class="muted">' + esc(p.name_en) + '</div>' : '') + '</td>' +
            '<td>' + esc(catName(p.category)) + '</td>' +
            '<td>' + money(p.price) + '</td>' +
            '<td>' + esc(p.quantity) + '</td>' +
            '<td>' + esc(p.size) + '</td>' +
            '<td class="actions"><button class="btn small" type="button" data-edit="' + esc(p.id) + '">' + t('admin.edit') + '</button> ' +
            '<button class="btn danger small" type="button" data-del="' + esc(p.id) + '">' + t('cart.del') + '</button></td>' +
            '</tr>'
        )
        .join('');
      fixImages(body);
      $$('button[data-edit]', body).forEach((b) =>
        b.addEventListener('click', () => {
          const p = cache.find((x) => String(x.id) === b.dataset.edit);
          if (p) setEditing(p);
        })
      );
      $$('button[data-del]', body).forEach((b) =>
        b.addEventListener('click', async () => {
          if (!confirm(t('admin.confirmDel'))) return;
          b.disabled = true;
          try {
            await api('/api/admin/products/' + encodeURIComponent(b.dataset.del), { method: 'DELETE' });
            toast(t('admin.deleted'), 'ok');
            loadProducts();
          } catch (e) {
            b.disabled = false;
            handle(e);
          }
        })
      );
    } catch (e) {
      handle(e);
    }
  }

  async function loadOrders() {
    const body = $('#orders-body');
    try {
      const { orders } = await api('/api/admin/orders');
      if (!orders.length) {
        body.innerHTML = '<tr><td colspan="7" class="empty">' + t('admin.noOrders') + '</td></tr>';
        return;
      }
      body.innerHTML = orders
        .map(
          (o) =>
            '<tr>' +
            '<td>#' + esc(o.id) + '</td>' +
            '<td>' + esc(o.customer) + '<div class="muted">' + esc(o.email) + '</div></td>' +
            '<td>' + esc(o.phone) + '<div class="muted">' + esc(o.address) + '</div></td>' +
            '<td><ul class="order-items">' +
            o.items.map((i) => '<li>' + esc(i.name) + ' × ' + esc(i.qty) + '</li>').join('') +
            '</ul></td>' +
            '<td>' + money(o.total) + '<div class="muted">' + esc(t('pay.' + o.payment_method)) + (o.payment_method === 'stripe' ? ' · ' + esc(t('pay.' + o.payment_status)) : '') + '</div></td>' +
            '<td>' + esc(new Date(o.created_at).toLocaleString(window.I18n.locale)) + '</td>' +
            '<td><select data-status="' + esc(o.id) + '">' +
            STATUS_KEYS
              .map((k) => '<option value="' + k + '"' + (k === o.status ? ' selected' : '') + '>' + t('status.' + k) + '</option>')
              .join('') +
            '</select></td>' +
            '</tr>'
        )
        .join('');
      $$('select[data-status]', body).forEach((s) =>
        s.addEventListener('change', async () => {
          try {
            const r = await api('/api/admin/orders/' + encodeURIComponent(s.dataset.status), {
              method: 'PATCH',
              body: { status: s.value }
            });
            toast(t('admin.statusUpdated') + (r.email === 'sent' ? ' — ' + t('admin.emailSent') : ''), 'ok');
            if (r.email === 'failed') toast(t('admin.emailFailed'), 'error');
          } catch (e) {
            handle(e);
            loadOrders();
          }
        })
      );
    } catch (e) {
      handle(e);
    }
  }

  const form = $('#product-form');
  const submitBtn = $('button[type=submit]', form);
  const cancelBtn = $('#cancel-edit');
  const FIELDS = ['name', 'name_en', 'description', 'description_en', 'specs', 'specs_en', 'size', 'category', 'price', 'quantity'];

  function setEditing(p) {
    editingId = p ? p.id : null;
    $('#form-title').textContent = t(p ? 'admin.editing' : 'admin.add');
    submitBtn.textContent = t(p ? 'admin.save' : 'admin.addBtn');
    cancelBtn.hidden = !p;
    $('#img-hint').hidden = !p;
    $('#product-msg').textContent = '';
    if (p) {
      FIELDS.forEach((f) => { form.elements[f].value = p[f] == null ? '' : p[f]; });
      form.elements.image.value = '';
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      form.elements.name.focus({ preventScroll: true });
    } else {
      form.reset();
    }
  }
  cancelBtn.addEventListener('click', () => setEditing(null));

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const msg = $('#product-msg');
    msg.textContent = '';
    submitBtn.disabled = true;
    const wasEditing = editingId !== null;
    try {
      await api(wasEditing ? '/api/admin/products/' + encodeURIComponent(editingId) : '/api/admin/products', {
        method: wasEditing ? 'PUT' : 'POST',
        body: new FormData(form)
      });
      setEditing(null);
      toast(t(wasEditing ? 'admin.updated' : 'admin.added'), 'ok');
      loadProducts();
      loadStats();
    } catch (e) {
      if (e.status === 401 || e.status === 403) handle(e);
      else msg.textContent = e.message;
    } finally {
      submitBtn.disabled = false;
    }
  });

  async function loadStats() {
    const box = $('#stats');
    try {
      const s = await api('/api/admin/stats');
      const tiles = [
        [money(s.revenue), 'admin.sRevenue'],
        [s.orders, 'admin.sOrders'],
        [s.pending, 'admin.sPending'],
        [s.products, 'admin.sProducts'],
        [s.lowStock, 'admin.sLow'],
        [s.customers, 'admin.sCustomers']
      ];
      box.innerHTML = tiles
        .map((x) => '<div class="stat"><div class="n">' + esc(x[0]) + '</div><div class="l">' + esc(t(x[1])) + '</div></div>')
        .join('');
    } catch (e) {
      handle(e);
    }
  }

  ready.then(() => {
    loadStats();
    loadProducts();
    loadOrders();
  });
})();
