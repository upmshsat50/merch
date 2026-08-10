# UPM SHS at 50 — Salubong 2026 Merch Store V7

This package is the login-fixed version.

## What is already fixed
- Supabase Project URL is already in `config.js`
- Supabase browser publishable key is already in `config.js`
- Public store and admin portal both use the same Supabase project
- JavaScript files have cache-busting versions so GitHub Pages is less likely to keep the old blank `config.js`
- Admin login verifies the authenticated user with Supabase Auth
- Admin authorization checks the user's own row in `admin_users`
- Admin page no longer shows setup/developer instructions to users
- Password show/hide control added

## If your database schema is already installed
Run `ADMIN-LOGIN-REPAIR.sql` once in Supabase SQL Editor.

Then create the four users in:
Authentication > Users > Add user

Use a different password for each person.

After creating the users, edit and run:
`ADMIN-ACCESS-SETUP.sql`

## If this is a fresh Supabase database
Run:
`supabase-schema.sql`

Then create your four Auth users and run:
`ADMIN-ACCESS-SETUP.sql`

## Upload to GitHub
Replace your current website files with everything in this V7 folder, especially:
- `config.js`
- `admin.js`
- `admin.html`
- `app.js`
- `index.html`

After GitHub Pages deploys, open the admin page again. The new query-string versions on the JS files help avoid loading the older cached configuration.

## Important
The publishable key in `config.js` is a browser/client key. Never add a Supabase secret key or service-role key to GitHub.
