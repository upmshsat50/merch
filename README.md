# UPM SHS at 50 — Salubong 2026 Merch Pre-Order Store

A ready-to-deploy mini merch store with:

- Salubong 2026 product catalog
- Shirt sizes and quantities
- Pre-order cart
- Buyer/contact/campus details
- GCash payment instructions
- Payment proof upload
- Secure Supabase database
- Private payment-proof storage
- Admin email/password login
- Admin order tracker
- Payment status workflow
- Production/claiming status workflow
- CSV export
- Buyer order reference + downloadable receipt

## Files

- `index.html` — public pre-order store
- `admin.html` — organizer dashboard
- `config.js` — Supabase + GCash settings
- `supabase-schema.sql` — database/RLS/storage setup
- `app.js` — public ordering flow
- `admin.js` — admin tracker
- `assets/` — merch images and GCash QR placeholder

## 1. Create / choose a Supabase project

Open your Supabase project.

Use the **Project URL** and the browser-safe **Publishable key** (`sb_publishable_...`).
Older projects may still show an `anon` key; that also works.

Never put a Supabase secret/service-role key in this website.

## 2. Run the database setup

Open Supabase > SQL Editor.

Paste the full contents of:

`supabase-schema.sql`

Run it once.

This creates:

- `merch_products`
- `merch_orders`
- `merch_order_items`
- `admin_users`
- private `payment-proofs` storage bucket
- Row Level Security policies
- `submit_merch_order()` transaction function
- `is_merch_admin()` helper

The public website does NOT get permission to read orders.

## 3. Connect the website

Edit `config.js`:

```js
supabaseUrl: "https://YOUR-PROJECT.supabase.co",
supabasePublishableKey: "sb_publishable_...",
```

Also update:

```js
gcashName: "NAME OF ACCOUNT",
gcashNumber: "09XX XXX XXXX",
preorderDeadline: "August XX, 2026",
```

## 4. Update the GCash QR

Replace:

`assets/gcash-qr-placeholder.svg`

with your real QR image.

You can also change `gcashQrImage` in `config.js` if your file has another name.

## 5. Create merch admin accounts

In Supabase:

Authentication > Users > Add user

Create the organizer's email/password.

Then in SQL Editor run:

```sql
insert into public.admin_users(user_id)
select id
from auth.users
where email = 'ADMIN_EMAIL_HERE'
on conflict do nothing;
```

Repeat for each organizer you want to authorize.

Then they can log in through:

`admin.html`

## 6. Deploy

The folder is a static website, so it works on:

- GitHub Pages
- Netlify
- Vercel
- Cloudflare Pages

Upload the entire folder, not only `index.html`.

## Security notes

- Only the Supabase publishable key belongs in `config.js`.
- Order prices are recalculated inside PostgreSQL, so buyers cannot simply change the browser price and submit a cheaper total.
- Buyers can submit orders but cannot read the order database.
- Payment proofs are stored in a private bucket.
- Admin access is checked against `admin_users`.
- The current public proof-upload policy is appropriate for a lightweight pre-order campaign, but a high-volume/public launch should add CAPTCHA or an Edge Function to reduce spam.

## Current merch seeded

Shirts — ₱350:
- UPM SHS
- Midwifery
- Nursing
- Medicine

Lanyards:
- SHS commemorative — ₱100
- Medicine — ₱100
- Nursing — ₱100
- Midwifery — ₱100

Prices and availability can be edited in `merch_products` after setup.

## Updated poster set

Version 3 uses the clean August 9, 2026 Salubong 2026 brochure exports supplied by the merch team.

- Shirts: ₱350 each
- SHS, Medicine, Nursing, and Midwifery lanyards: ₱100 each
- Nationwide shipping is highlighted on the public storefront
