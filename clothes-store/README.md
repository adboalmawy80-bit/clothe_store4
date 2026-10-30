# Elegance Store — Bilingual Clothing E‑Commerce (Node.js + TiDB + Vercel)

A ready‑to‑deploy online clothing store for **Men / Women / Kids** with an admin dashboard, Arabic (RTL) and English (LTR) interface and dark mode. Runs on **Vercel** with a free **TiDB Cloud** (MySQL‑compatible) database and **Vercel Blob** for product images.

> دليل بالعربي: [README.ar.md](README.ar.md)

## Features

**Storefront**
- Home page + Men / Women / Kids category pages
- Search, sort (newest / price low→high / high→low) and "in stock only" filter
- Cart with quantity +/−, remove item, stock‑aware limits
- Checkout (address, phone, payment: **international card via Stripe**, cash on delivery or e‑wallet) with stock deduction in a DB transaction
- "My orders" page with order and payment status, plus a "Pay now" retry for unpaid card orders
- Customer registration and login (bcrypt‑hashed passwords)
- Dark / light mode, Arabic / English with automatic RTL/LTR, responsive, keyboard accessible

**Admin dashboard** (`/admin`, admin role only)
- Stats: revenue, orders, pending orders, products, low stock, customers
- Add / edit / delete products — Arabic + English name, description, specs, price, quantity, sizes, category, image
- Orders list with customer, address, items, and status update (pending → confirmed → shipped → delivered / cancelled)

**Security**
- Parameterized SQL queries, server‑side price calculation, input validation
- Helmet security headers + CSP, login rate limiting, HttpOnly + SameSite signed‑cookie sessions
- Image upload validation by file signature (JPG / PNG / WebP / GIF, max 3 MB, random file names)

**Payments**
- **Stripe Checkout** (Visa, Mastercard, Amex, Apple/Google Pay where enabled): the customer pays on Stripe's hosted page, so no card data ever reaches your server.
- Orders are marked **paid** only by a signature‑verified Stripe webhook. Expired / failed payments cancel the order and return the stock automatically.
- Cash on delivery and e‑wallet remain available as manual methods (recorded only). If Stripe is not configured, the manual "card" option is shown instead.

## Requirements
- A free [TiDB Cloud](https://tidbcloud.com) account (Starter cluster)
- A free [Vercel](https://vercel.com) account and a GitHub account
- Node.js 18+ (only if you want to run it locally)

## Setup (about 10 minutes)

### 1) Database — TiDB Cloud
1. Create a **Starter** cluster.
2. Open the cluster → **Connect** → Connect Type **Public**, Branch `main`, Connect With **General**.
3. Click **Generate Password** and copy it (shown once).
4. Note the **Host**, **Port** (`4000`) and **User** (looks like `xxxx.root`).

Tables, the admin account and sample products are created automatically on the first request.

### 2) Upload the project to GitHub
```
git init
git add .
git commit -m "Elegance Store"
```
Create a repository on GitHub and push it.

### 3) Create the Vercel project
Vercel → **Add New → Project** → import the repository → Framework Preset **Other** → Deploy (the first deploy will show an error until the variables below are set).

### 4) Environment variables (Project → Settings → Environment Variables)
| Variable | Value |
|---|---|
| `DB_HOST` | TiDB host |
| `DB_PORT` | `4000` |
| `DB_USER` | TiDB user (`xxxx.root`) |
| `DB_PASSWORD` | the generated password |
| `DB_NAME` | `test` |
| `DB_SSL` | `true` |
| `SESSION_SECRET` | long random string (**required**) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | your admin account (choose a strong password) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STORE_CURRENCY` | optional, see step 5 |

### 5) International payments — Stripe (optional)
1. Create a [Stripe](https://stripe.com) account (test mode is fine to start).
2. **Developers → API keys** → copy the **Secret key** (`sk_test_...`) into `STRIPE_SECRET_KEY`.
3. **Developers → Webhooks → Add endpoint**: URL `https://YOUR-DOMAIN/api/stripe/webhook`, events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`. Copy the **Signing secret** (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`.
4. Set `STORE_CURRENCY` (e.g. `USD`, `EUR`, `GBP`, `AED`) — all prices are in this currency. Optionally set `SITE_URL`.
5. Redeploy. Test with card `4242 4242 4242 4242`, any future date, any CVC. Switch to `sk_live_...` and a live webhook secret when ready.

Stripe must support your business country (check Stripe's supported countries list). Locally, use the Stripe CLI: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.

### 6) Shipping emails (optional)
When you set an order to **Shipped** in the admin dashboard, the customer receives a bilingual email (once per order). Choose one provider:
- **Resend** (recommended): verify your domain at resend.com, create an API key → `RESEND_API_KEY`.
- **SMTP** (Gmail, Brevo, Mailgun…): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`.
Both need `MAIL_FROM` (e.g. `Elegance Store <orders@yourdomain.com>`; the domain must be verified with the provider). Optional `STORE_NAME`. Without these variables, no emails are sent and everything else works.

### 7) Product images — Vercel Blob
Project → **Storage → Create → Blob** and connect it to the project. This adds `BLOB_READ_WRITE_TOKEN` automatically. Without it, image upload is disabled (the rest works).

### 8) Redeploy
Deployments → **Redeploy**, then open your site. Log in at `/login.html` with the admin account and open `/admin`.

## Run locally (optional)
Copy `.env.example` to `.env`, fill in the same TiDB values, then:
```
npm install
npm start
```
Open http://localhost:3000 (without a Blob token, images are saved to `public/uploads/`).

## Project structure
```
server.js         Express app (API, sessions, uploads, Stripe webhook)
stripe.js         Stripe Checkout client + webhook signature check
db.js             Database connection, schema creation, seed data
api/index.js      Vercel serverless entry
vercel.json       Vercel routing
public/           Storefront (HTML, CSS, JS)
views/admin.html  Admin page (served only to admins)
schema.sql        Reference schema
screenshots/      Preview images
```

## Customization
- Brand name and texts: `public/js/i18n.js` (Arabic and English dictionaries)
- Colors and look: CSS variables at the top of `public/css/style.css`
- Add a language: add a new dictionary in `i18n.js`

## Notes
- Login rate limiting works per serverless instance. For stronger protection use Vercel Firewall.
- The first request after an idle period can be slower (cold start + database connection).
- If you change `ADMIN_EMAIL` / `ADMIN_PASSWORD` after the first run, the existing admin account is not changed.

## Support & License
See `LICENSE.txt` and `CHANGELOG.md`.
