(function () {
  'use strict';

  var DICT = {
    ar: {
      brand: 'متجر الأناقة',
      cur: 'ج.م',
      footer: '© متجر الأناقة — جميع الحقوق محفوظة',
      'nav.home': 'الرئيسية', 'nav.men': 'رجال', 'nav.kids': 'أطفال', 'nav.women': 'نساء',
      'nav.cart': '🛒 السلة', 'nav.admin': 'لوحة التحكم', 'nav.hello': 'أهلاً، {name}',
      'nav.logout': 'تسجيل الخروج', 'nav.login': 'تسجيل الدخول',
      'nav.theme': 'تبديل الوضع الليلي', 'nav.menu': 'القائمة', 'nav.lang': 'English', 'nav.skip': 'تخطي إلى المحتوى',
      'nav.orders': 'طلباتي',
      'f.search': 'بحث', 'f.searchPh': 'ابحث عن منتج...', 'f.sort': 'الترتيب', 'f.sortNew': 'الأحدث',
      'f.sortLow': 'السعر: الأقل أولاً', 'f.sortHigh': 'السعر: الأعلى أولاً', 'f.instock': 'المتوفر فقط',
      'f.count': '{n} منتج', 'p.noMatch': 'لا توجد نتائج مطابقة لبحثك.',
      'cart.dec': 'تقليل الكمية', 'cart.inc': 'زيادة الكمية',
      'orders.title': 'طلباتي', 'orders.h1': 'طلباتي', 'orders.none': 'لا توجد طلبات بعد.',
      'admin.sOrders': 'الطلبات', 'admin.sRevenue': 'الإيرادات', 'admin.sPending': 'طلبات قيد الانتظار',
      'admin.sProducts': 'المنتجات', 'admin.sLow': 'مخزون منخفض (5 أو أقل)', 'admin.sCustomers': 'العملاء',
      'admin.edit': 'تعديل', 'admin.save': 'حفظ التعديلات', 'admin.cancel': 'إلغاء', 'admin.updated': 'تم تحديث المنتج',
      'admin.editing': 'تعديل منتج', 'admin.keepImage': 'اتركه فارغاً للإبقاء على الصورة الحالية',
      'home.h1': 'أناقتك تبدأ من هنا',
      'home.p': 'تسوّق أحدث ملابس الرجال والأطفال والنساء بأسعار مناسبة وجودة عالية.',
      'home.browse': 'تصفح القسم',
      'cat.men': 'ملابس رجال', 'cat.kids': 'ملابس أطفال', 'cat.women': 'ملابس نساء',
      'cat.men.short': 'رجال', 'cat.kids.short': 'أطفال', 'cat.women.short': 'نساء',
      'p.none': 'لا توجد منتجات في هذا القسم حالياً.',
      'p.size': 'المقاس', 'p.stock': 'المتوفر', 'p.buy': 'شراء', 'p.soldout': 'نفدت الكمية',
      'cart.title': 'السلة', 'cart.h1': 'سلة المشتريات',
      'cart.empty': 'السلة فارغة.', 'cart.browse': 'تصفح المنتجات',
      'cart.qty': 'الكمية', 'cart.delete': 'حذف', 'cart.total': 'الإجمالي', 'cart.pay': 'إتمام الدفع',
      'co.title': 'الدفع', 'co.h1': 'إتمام الطلب والدفع', 'co.summary': 'ملخص الطلب',
      'co.address': 'عنوان التوصيل', 'co.addressPh': 'المحافظة - المدينة - الشارع - رقم المبنى',
      'co.phone': 'رقم الهاتف', 'co.method': 'طريقة الدفع',
      'co.cash': 'الدفع عند الاستلام', 'co.wallet': 'محفظة إلكترونية (فودافون كاش / انستاباي)',
      'co.card': 'بطاقة بنكية',
      'co.stripe': 'بطاقة دولية (Visa / Mastercard) — دفع آمن عبر Stripe',
      'co.noteStripe': 'ستنتقل إلى صفحة Stripe الآمنة لإتمام الدفع. لا نخزّن أي بيانات بطاقة على موقعنا.',
      'admin.emailSent': 'تم إرسال إيميل الشحن للعميل', 'admin.emailFailed': 'تم تحديث الحالة لكن فشل إرسال الإيميل (راجع إعدادات البريد)',
      'pay.paid': 'مدفوع', 'pay.unpaid': 'غير مدفوع', 'orders.payNow': 'ادفع الآن',
      'orders.paidOk': 'تم الدفع بنجاح، شكرًا لك! سيتم تأكيد طلبك.', 'orders.cancelledPay': 'لم يكتمل الدفع. يمكنك المحاولة مرة أخرى من الطلب أدناه.',
      'co.note': 'لا يتم حفظ أي بيانات بطاقة على الموقع. سيتواصل معك المتجر لتأكيد الدفع.',
      'co.confirm': 'تأكيد الطلب', 'co.success': 'تم استلام طلبك بنجاح',
      'co.orderNo': 'رقم الطلب', 'co.continue': 'متابعة التسوق',
      'login.title': 'تسجيل الدخول', 'login.tab': 'تسجيل الدخول', 'login.register': 'حساب جديد',
      'login.email': 'البريد الإلكتروني', 'login.password': 'كلمة المرور',
      'login.submit': 'دخول', 'login.name': 'الاسم',
      'login.password8': 'كلمة المرور (8 أحرف على الأقل)', 'login.create': 'إنشاء حساب',
      'ad.title': 'لوحة التحكم', 'ad.h1': '⚙️ لوحة تحكم الأدمن', 'ad.add': 'إضافة منتج جديد',
      'ad.name': 'اسم المنتج (بالعربي)', 'ad.nameEn': 'اسم المنتج (بالإنجليزي)', 'ad.descEn': 'وصف المنتج (بالإنجليزي)', 'ad.specsEn': 'المواصفات (بالإنجليزي)', 'ad.cat': 'القسم', 'ad.price': 'السعر', 'ad.qty': 'الكمية',
      'ad.size': 'المقاس (مثال: S, M, L)', 'ad.image': 'صورة المنتج',
      'ad.desc': 'وصف المنتج (بالعربي)', 'ad.specs': 'المواصفات (بالعربي)', 'ad.addBtn': 'إضافة المنتج',
      'ad.products': 'المنتجات', 'ad.orders': 'الطلبات',
      'ad.thImg': 'صورة', 'ad.thName': 'الاسم', 'ad.thCat': 'القسم', 'ad.thPrice': 'السعر',
      'ad.thQty': 'الكمية', 'ad.thSize': 'المقاس', 'ad.thCustomer': 'العميل',
      'ad.thContact': 'التواصل والعنوان', 'ad.thItems': 'المنتجات', 'ad.thTotal': 'الإجمالي',
      'ad.thDate': 'التاريخ', 'ad.thStatus': 'الحالة',
      'ad.noProducts': 'لا توجد منتجات', 'ad.noOrders': 'لا توجد طلبات بعد',
      'ad.confirmDel': 'هل تريد حذف هذا المنتج نهائياً؟',
      'ad.deleted': 'تم حذف المنتج', 'ad.added': 'تمت إضافة المنتج', 'ad.updated': 'تم تحديث حالة الطلب',
      'st.pending': 'قيد الانتظار', 'st.confirmed': 'مؤكد', 'st.shipped': 'تم الشحن',
      'st.delivered': 'تم التسليم', 'st.cancelled': 'ملغي',
      'err.generic': 'حدث خطأ، حاول مرة أخرى'
    },
    en: {
      brand: 'Elegance Store',
      cur: 'EGP',
      footer: '© Elegance Store — All rights reserved',
      'nav.home': 'Home', 'nav.men': 'Men', 'nav.kids': 'Kids', 'nav.women': 'Women',
      'nav.cart': '🛒 Cart', 'nav.admin': 'Dashboard', 'nav.hello': 'Hello, {name}',
      'nav.logout': 'Log out', 'nav.login': 'Log in',
      'nav.theme': 'Toggle dark mode', 'nav.menu': 'Menu', 'nav.lang': 'العربية', 'nav.skip': 'Skip to content',
      'nav.orders': 'My orders',
      'f.search': 'Search', 'f.searchPh': 'Search products…', 'f.sort': 'Sort by', 'f.sortNew': 'Newest',
      'f.sortLow': 'Price: low to high', 'f.sortHigh': 'Price: high to low', 'f.instock': 'In stock only',
      'f.count': '{n} products', 'p.noMatch': 'No products match your search.',
      'cart.dec': 'Decrease quantity', 'cart.inc': 'Increase quantity',
      'orders.title': 'My orders', 'orders.h1': 'My orders', 'orders.none': 'No orders yet.',
      'admin.sOrders': 'Orders', 'admin.sRevenue': 'Revenue', 'admin.sPending': 'Pending orders',
      'admin.sProducts': 'Products', 'admin.sLow': 'Low stock (5 or fewer)', 'admin.sCustomers': 'Customers',
      'admin.edit': 'Edit', 'admin.save': 'Save changes', 'admin.cancel': 'Cancel', 'admin.updated': 'Product updated',
      'admin.editing': 'Edit product', 'admin.keepImage': 'Leave empty to keep the current image',
      'home.h1': 'Your style starts here',
      'home.p': 'Shop the latest men’s, kids’ and women’s clothing at fair prices and high quality.',
      'home.browse': 'Browse',
      'cat.men': 'Men’s Clothing', 'cat.kids': 'Kids’ Clothing', 'cat.women': 'Women’s Clothing',
      'cat.men.short': 'Men', 'cat.kids.short': 'Kids', 'cat.women.short': 'Women',
      'p.none': 'No products in this category yet.',
      'p.size': 'Size', 'p.stock': 'In stock', 'p.buy': 'Buy', 'p.soldout': 'Out of stock',
      'cart.title': 'Cart', 'cart.h1': 'Shopping Cart',
      'cart.empty': 'Your cart is empty.', 'cart.browse': 'Browse products',
      'cart.qty': 'Qty', 'cart.delete': 'Remove', 'cart.total': 'Total', 'cart.pay': 'Checkout',
      'co.title': 'Checkout', 'co.h1': 'Checkout & Payment', 'co.summary': 'Order summary',
      'co.address': 'Delivery address', 'co.addressPh': 'Governorate - City - Street - Building no.',
      'co.phone': 'Phone number', 'co.method': 'Payment method',
      'co.cash': 'Cash on delivery', 'co.wallet': 'E-wallet (Vodafone Cash / InstaPay)',
      'co.card': 'Bank card',
      'co.stripe': 'International card (Visa / Mastercard) — secure payment via Stripe',
      'co.noteStripe': 'You will be redirected to Stripe’s secure page to complete payment. No card data is stored on our site.',
      'admin.emailSent': 'Shipping email sent to the customer', 'admin.emailFailed': 'Status updated, but the email could not be sent (check mail settings)',
      'pay.paid': 'Paid', 'pay.unpaid': 'Unpaid', 'orders.payNow': 'Pay now',
      'orders.paidOk': 'Payment received, thank you! Your order will be confirmed.', 'orders.cancelledPay': 'Payment was not completed. You can try again from the order below.',
      'co.note': 'No card data is stored on this site. The store will contact you to confirm payment.',
      'co.confirm': 'Confirm order', 'co.success': 'Your order was received successfully',
      'co.orderNo': 'Order number', 'co.continue': 'Continue shopping',
      'login.title': 'Log in', 'login.tab': 'Log in', 'login.register': 'New account',
      'login.email': 'Email', 'login.password': 'Password',
      'login.submit': 'Log in', 'login.name': 'Name',
      'login.password8': 'Password (at least 8 characters)', 'login.create': 'Create account',
      'ad.title': 'Dashboard', 'ad.h1': '⚙️ Admin Dashboard', 'ad.add': 'Add a new product',
      'ad.name': 'Product name (Arabic)', 'ad.nameEn': 'Product name (English)', 'ad.descEn': 'Description (English)', 'ad.specsEn': 'Specifications (English)', 'ad.cat': 'Category', 'ad.price': 'Price', 'ad.qty': 'Quantity',
      'ad.size': 'Size (e.g. S, M, L)', 'ad.image': 'Product image',
      'ad.desc': 'Description (Arabic)', 'ad.specs': 'Specifications (Arabic)', 'ad.addBtn': 'Add product',
      'ad.products': 'Products', 'ad.orders': 'Orders',
      'ad.thImg': 'Image', 'ad.thName': 'Name', 'ad.thCat': 'Category', 'ad.thPrice': 'Price',
      'ad.thQty': 'Qty', 'ad.thSize': 'Size', 'ad.thCustomer': 'Customer',
      'ad.thContact': 'Contact & address', 'ad.thItems': 'Items', 'ad.thTotal': 'Total',
      'ad.thDate': 'Date', 'ad.thStatus': 'Status',
      'ad.noProducts': 'No products', 'ad.noOrders': 'No orders yet',
      'ad.confirmDel': 'Delete this product permanently?',
      'ad.deleted': 'Product deleted', 'ad.added': 'Product added', 'ad.updated': 'Order status updated',
      'st.pending': 'Pending', 'st.confirmed': 'Confirmed', 'st.shipped': 'Shipped',
      'st.delivered': 'Delivered', 'st.cancelled': 'Cancelled',
      'err.generic': 'Something went wrong, please try again'
    }
  };

  // ترجمة رسائل السيرفر (تصل بالعربي) عند اختيار الإنجليزية
  var SERVER_EN = {
    'يجب تسجيل الدخول أولاً': 'Please log in first',
    'غير مصرح لك': 'Not authorized',
    'محاولات كثيرة، حاول مرة أخرى بعد قليل': 'Too many attempts, please try again later',
    'الاسم يجب أن يكون بين 2 و 100 حرف': 'Name must be between 2 and 100 characters',
    'البريد الإلكتروني غير صالح': 'Invalid email address',
    'كلمة المرور يجب أن تكون من 8 إلى 72 حرفاً': 'Password must be 8 to 72 characters',
    'هذا البريد مسجل بالفعل': 'This email is already registered',
    'البريد أو كلمة المرور غير صحيحة': 'Incorrect email or password',
    'بيانات غير صالحة': 'Invalid data',
    'المنتج غير موجود': 'Product not found',
    'المنتج غير متوفر حالياً': 'Product is currently unavailable',
    'العنوان غير صالح': 'Invalid address',
    'رقم الهاتف غير صالح': 'Invalid phone number',
    'اختر طريقة دفع صحيحة': 'Choose a valid payment method',
    'السلة فارغة': 'Your cart is empty',
    'نوع الصورة غير مدعوم (jpg / png / webp / gif)': 'Unsupported image type (jpg / png / webp / gif)',
    'اسم المنتج مطلوب (حتى 150 حرفاً)': 'Product name is required (up to 150 characters)',
    'النص طويل جداً': 'Text is too long',
    'المقاس طويل جداً': 'Size is too long',
    'اختر القسم': 'Choose a category',
    'السعر غير صالح': 'Invalid price',
    'الكمية غير صالحة': 'Invalid quantity',
    'حجم الصورة أكبر من 3 ميجا': 'Image is larger than 3 MB',
    'خطأ في رفع الصورة': 'Image upload error',
    'غير موجود': 'Not found',
    'حدث خطأ في السيرفر': 'Server error'
  };
  var STOCK_PREFIX = 'الكمية المطلوبة غير متوفرة للمنتج: ';


  // مفاتيح بديلة تستخدمها ملفات app.js و admin.js وصفحة الأدمن
  var ALIAS = {
    'admin.added': 'ad.added', 'admin.confirmDel': 'ad.confirmDel', 'admin.deleted': 'ad.deleted',
    'admin.noOrders': 'ad.noOrders', 'admin.noProducts': 'ad.noProducts', 'admin.statusUpdated': 'ad.updated',
    'admin.title': 'ad.h1', 'admin.add': 'ad.add', 'admin.addBtn': 'ad.addBtn', 'admin.category': 'ad.cat',
    'admin.desc': 'ad.desc', 'admin.image': 'ad.image', 'admin.orders': 'ad.orders', 'admin.pname': 'ad.name',
    'admin.price': 'ad.price', 'admin.products': 'ad.products', 'admin.qty': 'ad.qty', 'admin.size': 'ad.size',
    'admin.specs': 'ad.specs', 'admin.thContact': 'ad.thContact', 'admin.thCustomer': 'ad.thCustomer',
    'admin.thDate': 'ad.thDate', 'admin.thImage': 'ad.thImg', 'admin.thItems': 'ad.thItems',
    'admin.thName': 'ad.thName', 'admin.thPrice': 'ad.thPrice', 'admin.thSize': 'ad.thSize',
    'admin.thStatus': 'ad.thStatus', 'admin.nameEn': 'ad.nameEn', 'admin.descEn': 'ad.descEn', 'admin.specsEn': 'ad.specsEn', 'admin.thCat': 'ad.thCat', 'admin.thQty': 'ad.thQty', 'admin.thTotal': 'ad.thTotal',
    'title.admin': 'ad.title',
    'cart.del': 'cart.delete', 'cart.checkout': 'cart.pay', 'co.done': 'co.success', 'currency': 'cur',
    'prod.buy': 'p.buy', 'prod.none': 'p.none', 'prod.size': 'p.size', 'prod.soldout': 'p.soldout', 'prod.stock': 'p.stock',
    'pay.cash': 'co.cash', 'pay.wallet': 'co.wallet', 'pay.card': 'co.card', 'pay.stripe': 'co.stripe',
    'status.pending': 'st.pending', 'status.confirmed': 'st.confirmed', 'status.shipped': 'st.shipped',
    'status.delivered': 'st.delivered', 'status.cancelled': 'st.cancelled'
  };

  var lang = 'ar';
  try {
    var saved = localStorage.getItem('lang');
    if (saved === 'ar' || saved === 'en') lang = saved;
  } catch (e) { /* تجاهل */ }
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';

  function t(key, vars) {
    if (ALIAS[key]) key = ALIAS[key];
    var s = DICT[lang][key];
    if (s == null) s = DICT.ar[key];
    if (s == null) return key;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, n) { return vars[n] != null ? vars[n] : m; });
    return s;
  }

  function server(msg) {
    if (lang === 'ar' || !msg) return msg;
    if (SERVER_EN[msg]) return SERVER_EN[msg];
    if (msg.indexOf(STOCK_PREFIX) === 0) return 'Requested quantity not available for: ' + msg.slice(STOCK_PREFIX.length);
    return msg;
  }

  function err(msg) {
    return server(msg) || t('err.generic');
  }
  function other() { return lang === 'ar' ? 'en' : 'ar'; }
  function shortOf(l) { return l === 'ar' ? 'ع' : 'EN'; }

  function setLang(l) {
    try { localStorage.setItem('lang', l); } catch (e) { /* تجاهل */ }
    location.reload();
  }

  function applyStatic() {
    var i, els;
    els = document.querySelectorAll('[data-i18n]');
    for (i = 0; i < els.length; i++) els[i].textContent = t(els[i].getAttribute('data-i18n'));
    els = document.querySelectorAll('[data-i18n-ph]');
    for (i = 0; i < els.length; i++) els[i].setAttribute('placeholder', t(els[i].getAttribute('data-i18n-ph')));
    var key = document.body && document.body.getAttribute('data-title');
    if (key) document.title = t(key) + ' - ' + t('brand');
  }

  window.I18n = {
    t: t,
    server: server,
    err: err,
    other: other,
    shortOf: shortOf,
    setLang: setLang,
    applyStatic: applyStatic,
    get lang() { return lang; },
    get locale() { return lang === 'ar' ? 'ar-EG' : 'en-US'; }
  };

  document.addEventListener('DOMContentLoaded', applyStatic);
})();
