# UPM SHS at 50 — Salubong 2026 Merch Website

This is a ready-to-deploy static pre-order website based on the merch posters you provided.

## Included
- Responsive home/shop page
- 4 shirts at ₱350
- 4 lanyards (₱100 / ₱175)
- Shirt size selector
- Pre-order cart with quantity controls
- Customer details form
- Automatic total calculation
- Downloadable order receipt
- Optional backend endpoint support

## Deploy quickly
You can upload the whole folder to:
- GitHub Pages
- Netlify
- Vercel
- Cloudflare Pages

For GitHub Pages, upload all files in this folder to a repository, then enable Pages in repository settings.

## Collect orders online
Open `app.js` and find:

    const ORDER_ENDPOINT = "";

Paste your Google Apps Script, Formspree, Supabase Edge Function, or your own API endpoint between the quotes.

The site sends a JSON object containing:
- reference
- submittedAt
- customer details
- ordered items
- total

If you leave the endpoint blank, the site still works in "demo mode" and downloads a receipt for the buyer.

## Replace images / QR code posters
The QR codes shown in the original Canva screenshots are NOT used for checkout. The website has its own buttons and order flow.

To update product images later, replace the files in `assets/` while keeping the same filenames.

## Product data
Edit product names, prices, descriptions, and size choices in the `products` array near the top of `app.js`.
