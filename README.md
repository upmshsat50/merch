# UPM SHS at 50 — Salubong 2026 Merch Store V8

This version separates the admin login and dashboard into two pages.

## Admin flow

- `admin.html` — login page only
- `admin-dashboard.html` — protected dashboard

After a successful login, the browser automatically redirects:

`admin.html` → `admin-dashboard.html`

If somebody opens `admin-dashboard.html` without a valid authorized session, the page automatically sends them back to `admin.html`.

If an admin is already logged in and opens `admin.html`, the site automatically sends them to `admin-dashboard.html`.

Signing out sends the user back to `admin.html`.

## Files for admin access

- `ADMIN-LOGIN-REPAIR.sql` — safe database/policy repair
- `ADMIN-ACCESS-SETUP.sql` — authorize the four admin Auth users

## Deployment

Replace the old website files in GitHub with this entire V8 folder.

Important new files:
- `admin-login.js`
- `admin-dashboard.html`
- `admin-dashboard.js`

The old `admin.js` is intentionally removed.

## Supabase

The browser-side Supabase Project URL and Publishable Key already remain in `config.js`.

Never add a Supabase secret/service-role key to the public GitHub repository.
