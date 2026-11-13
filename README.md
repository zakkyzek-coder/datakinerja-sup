# DataKinerja — Supabase + GitHub Pages

This repository contains the static-hosting migration of the existing DataKinerja dashboard. The original dashboard markup, styles, mobile behavior, and chart/rendering logic were carried over from the supplied GAS HTML files.

## Files

- `index.html` — dashboard markup and login screen
- `styles.css`, `mobile.css` — original styling and mobile overrides
- `scripts.js`, `mobile.js` — existing dashboard logic and mobile drawer behavior
- `supabase-client.js` — Supabase Auth integration and a compatibility bridge for the old `google.script.run` calls
- `supabase-data.js` — reads `bks_sumber`, `bks_data`, and selected `bks_pengaturan` values and maps rows to the existing dashboard data contract

## Supabase

- Project URL: `https://qrdmphbpqgsymfzxgija.supabase.co`
- Browser uses only the public publishable key. Never put a `service_role` key in this repository.
- Login uses Supabase Auth **email + password**. The signed-in user must have an active matching row in `bks_pengguna`.
- Data access depends on the existing RLS policies. Do not disable RLS to make the app work.

## Current migration status

The original renderer is preserved, and data/login calls have been redirected to Supabase. This is a **staged migration, not yet a complete production replacement**.

The current `bks_sumber` table contains only six registered sources: `Aset 1`, `DPK 1`, `Pby 1`, `Eks FLPP 1`, `NOA Eks FLPP 1`, and `Peringkat AO`. Many pages in the original dashboard request additional sources; those pages will show missing-data notices until the corresponding sources and rows are imported/registered in Supabase. No existing GAS application or database schema was changed during frontend integration.

The legacy user-management screen is not migrated yet. Creating/deleting branch users must be implemented through a secure server-side admin function; do not expose service-role credentials in the browser.

## Enable GitHub Pages

1. Open **Settings → Pages** in this repository.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select branch `main` and folder `/(root)`, then save.
4. Wait for GitHub Pages to publish the site; GitHub will show the site URL on the same settings page.

## Test checklist before relying on it

- Sign in with the email/password for an active Supabase Auth user linked to `bks_pengguna`.
- Verify the Aset, DPK, and Pembiayaan summary against the existing GAS dashboard for the same period and unit.
- Check the top-bar warning for missing sources. A successful login does not mean every dashboard page has been migrated.
- Test desktop and mobile layout.
- Keep the original GAS deployment available until the full source inventory, authentication, role management, and numerical comparisons are complete.
