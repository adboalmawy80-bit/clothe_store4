# Changelog

## 1.3.0
- Customer shipping email (Arabic + English) sent once when an order is marked "shipped" (Resend or SMTP); email failure never blocks the status update

## 1.2.0
- International card payments with Stripe Checkout (hosted page, signed webhook, automatic stock release on expired payments)
- "Pay now" retry for unpaid orders; payment status shown to customers and in the admin dashboard
- Store-wide currency via `STORE_CURRENCY` (default USD); sample prices now in USD
- Orders table migrates automatically (new payment columns)

## 1.1.0
- Added product search, sorting and in-stock filter
- Added product editing in the admin dashboard
- Added dashboard statistics
- Added cart quantity controls and "My orders" page
- Added Vercel deployment support (signed-cookie sessions, Vercel Blob uploads, hosted MySQL/TiDB with SSL)
- New design (tape-measure theme), Arabic/English interface, bilingual products

## 1.0.0
- Initial release
