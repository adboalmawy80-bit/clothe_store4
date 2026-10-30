# متجر الأناقة — موقع ملابس بلغتين (Node.js + TiDB + Vercel)

متجر ملابس (رجال / أطفال / نساء) بلوحة تحكم للأدمن، وواجهة عربي وإنجليزي، ووضع ليلي. يعمل على **Vercel** مع قاعدة **TiDB Cloud** المجانية (متوافقة مع MySQL) و**Vercel Blob** لصور المنتجات.

## الميزات
- بحث وترتيب (الأحدث / السعر) وفلتر "المتوفر فقط".
- سلة مع تعديل الكمية، وصفحة دفع (**بطاقة دولية عبر Stripe** / عند الاستلام / محفظة إلكترونية)، وصفحة "طلباتي" بحالة الطلب والدفع وزر "ادفع الآن".
- تسجيل دخول وحساب جديد للعميل (كلمات المرور مشفّرة).
- لوحة الأدمن (`/admin`): إحصائيات، إضافة وتعديل وحذف المنتجات (اسم ووصف ومواصفات بالعربي والإنجليزي وسعر وكمية ومقاس وصورة)، ومتابعة الطلبات وتغيير حالتها.
- حماية: استعلامات SQL آمنة، حساب الأسعار من السيرفر، Helmet وCSP، حد لمحاولات الدخول، جلسات في كوكي موقّع، والتحقق من نوع الصور.

**الدفع الدولي:** يدفع العميل في صفحة Stripe الرسمية (Visa / Mastercard وغيرها) فلا تصل بيانات البطاقة لسيرفرك أبداً. الطلب يُعتبر **مدفوعاً** فقط عبر Webhook موقّع من Stripe، وعند انتهاء مهلة الدفع أو فشله يُلغى الطلب ويرجع المخزون تلقائياً. الدفع عند الاستلام والمحفظة يبقيان كتسجيل يدوي.

## خطوات التشغيل (حوالي 10 دقائق)

### 1) قاعدة البيانات — TiDB Cloud
1. سجّل في https://tidbcloud.com وأنشئ Cluster من نوع **Starter** (مجاني).
2. افتحه واضغط **Connect** ← Connect Type: **Public** ← Branch: `main` ← Connect With: **General**.
3. اضغط **Generate Password** وانسخ كلمة المرور فوراً (لا تظهر مرة أخرى).
4. انسخ: **Host** و**Port** (`4000`) و**User** (شكله `xxxx.root`).

الجداول وحساب الأدمن والمنتجات التجريبية تُنشأ تلقائياً عند أول طلب.

### 2) ارفع المشروع على GitHub
```
git init
git add .
git commit -m "Elegance Store"
```
ثم أنشئ repository على GitHub وارفعه.

### 3) أنشئ المشروع على Vercel
vercel.com ← **Add New → Project** ← اختر الـ repository ← Framework Preset: **Other** ← Deploy.

### 4) متغيرات البيئة (Settings → Environment Variables)
| المتغير | القيمة |
|---|---|
| `DB_HOST` | الـ Host من TiDB |
| `DB_PORT` | `4000` |
| `DB_USER` | الـ User (`xxxx.root`) |
| `DB_PASSWORD` | كلمة المرور اللي ولّدتها |
| `DB_NAME` | `test` |
| `DB_SSL` | `true` |
| `SESSION_SECRET` | نص عشوائي طويل (**إجباري**) |
| `ADMIN_EMAIL` `ADMIN_PASSWORD` `ADMIN_NAME` | حساب الأدمن (اختر كلمة مرور قوية) |
| `STRIPE_SECRET_KEY` `STRIPE_WEBHOOK_SECRET` `STORE_CURRENCY` | اختيارية، شوف الخطوة 5 |

### 5) الدفع الدولي — Stripe (اختياري)
1. أنشئ حساب في https://stripe.com (ابدأ بوضع الاختبار Test mode).
2. **Developers ← API keys**: انسخ **Secret key** (`sk_test_...`) إلى `STRIPE_SECRET_KEY`.
3. **Developers ← Webhooks ← Add endpoint**: الرابط `https://دومينك/api/stripe/webhook` والأحداث: `checkout.session.completed` و`checkout.session.async_payment_succeeded` و`checkout.session.async_payment_failed` و`checkout.session.expired`. انسخ **Signing secret** (`whsec_...`) إلى `STRIPE_WEBHOOK_SECRET`.
4. حدّد `STORE_CURRENCY` (مثل `USD` أو `EUR` أو `AED`): كل الأسعار بهذه العملة.
5. أعد النشر وجرّب ببطاقة `4242 4242 4242 4242` وأي تاريخ مستقبلي وأي CVC. بعدها بدّل لمفاتيح `live`.

مهم: Stripe لازم يدعم بلد نشاطك التجاري (راجع قائمة الدول المدعومة عندهم). للتجربة المحلية استخدم Stripe CLI: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.

### 6) إيميل الشحن (اختياري)
لما تغيّر حالة الطلب إلى **تم الشحن** من لوحة الأدمن، يوصل العميل إيميل بالعربي والإنجليزي (مرة واحدة لكل طلب). اختر مزوّد واحد:
- **Resend** (الأسهل): وثّق دومينك في resend.com وأنشئ API key ← `RESEND_API_KEY`.
- **SMTP** (Gmail أو Brevo أو Mailgun…): `SMTP_HOST` و`SMTP_PORT` و`SMTP_USER` و`SMTP_PASS`.
والاثنان يحتاجان `MAIL_FROM` (مثل `Elegance Store <orders@yourdomain.com>` والدومين لازم يكون موثّقاً عند المزوّد). بدون هذه المتغيرات لا تُرسل إيميلات والباقي يعمل عادي.

### 7) صور المنتجات — Vercel Blob
من المشروع: **Storage → Create → Blob** وربطه بالمشروع، فيُضاف `BLOB_READ_WRITE_TOKEN` تلقائياً. بدونه لا يعمل رفع الصور (باقي الموقع يعمل).

### 8) أعد النشر (Redeploy)
من Deployments اضغط **Redeploy**، وافتح الموقع. ادخل من `/login.html` بحساب الأدمن ثم افتح `/admin`.

## تشغيل محلي (اختياري)
انسخ `.env.example` إلى `.env` وضع نفس بيانات TiDB، ثم:
```
npm install
npm start
```
وافتح http://localhost:3000

## ملاحظات
- لو تركت `ADMIN_PASSWORD` فارغة، يُولَّد باسورد عشوائي ويظهر **مرة واحدة** في سجل السيرفر (Vercel → Logs).
- لو غيّرت بيانات الأدمن بعد أول تشغيل لن تتغير، لأن الحساب أُنشئ بالفعل.
- حد محاولات الدخول يعمل لكل نسخة serverless؛ للحماية الأقوى استخدم Vercel Firewall.
- أول طلب بعد فترة خمول قد يكون أبطأ.
