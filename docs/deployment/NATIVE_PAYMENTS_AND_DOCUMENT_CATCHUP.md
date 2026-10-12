# Native checkout and financial catch-up — 13 October 2026

## Implemented

- Approved checkout layout retained; M-PESA/Airtel phone accordions and Card InlineJS V2. No Till or hosted full-page payment redirect in this page.
- Server prices, Kenyan E.164 normalization, authenticated ownership, durable intent reservations and one active attempt per account/mode.
- Uncertain initiation retains a reference and never retries a charge automatically. The page polls verification, supports interrupted-session recovery, and stops polling after three minutes without declaring the payment failed.
- Existing atomic live fulfillment preserved. Separate test ledger cannot grant membership. Signed webhook modes must match references. Pre-native live orders retain verification recovery.
- Optional monthly reusable-card renewal: explicit consent, encrypted authorization token, durable per-renewal reservation, no ambiguous charge retry, user disable endpoint. Annual/mobile payments remain manual. Disabled until configured and bank/card flows tested.
- Source PDF/File jobs prioritized before secondary tabs. Chromium disconnects reset the shared browser; polling no longer makes initial navigation depend on indefinite network-idle.
- Active financial-page reads can wake a sleeping collector through a bounded, coalesced ten-minute catch-up request. This is not paid always-on hosting; sleeping services still have cold-start delays.
- KenyanStocks financial HTML tables are displayed separately with original year labels/rounding, source attribution and collection dates. They are not canonical issuer statements and never enter valuation inputs automatically.
- Private scraper origin controls, bounded JSON bodies, Worker encoded-route/cross-site/content-type checks and security headers; checkout/auth and every proxied API remain uncached.

## Verified

- Paystack **real Test Mode**: M-PESA and Airtel Charge API initialization and verification succeeded at KES 1,000 using dummy email and published sandbox phone. Card initialization returned a secure access code. No live credential used or real charge made.
- Actual database-backed native test on operator profile: same-intent retry and a second-tab intent reused one reference; concurrent verification succeeded; real membership/expiry unchanged.
- Native payment/renewal tables migration applied and anonymous/authenticated roles cannot read or write them.
- Render `PAYSTACK_TEST_SECRET_KEY` saved server-only; live key/callback/settings preserved.
- Signed-in browser Test Mode: Card success, native M-PESA and native Airtel Money all reached backend-verified confirmation without a hosted checkout redirect. Declined Card -> close -> resume reused the same reference; simulated bank authentication then reached verified confirmation. No real charges or membership activation occurred.
- Browser testing caught Paystack's initialized-card `abandoned` status: Inline sessions now retain their reservation and access code instead of inviting a duplicate charge. Recurring authorization charges without an Inline access code still finalize failure normally.
- Final checks: backend 398 passed / 6 skipped; app 104 passed; scraper targeted 8 passed; Worker 7 passed. Backend, app and scraper typechecks and the app production build passed.
- Read-only source audit: 532 KenyanStocks extractions, 719 queued jobs including 102 PDF jobs, 55 pending heuristic candidates, no mirror PDFs published yet. COOP source-table presentation exposes all five financial categories with 2021–2024 columns.

## Remaining rollout gates — do not claim these are complete

1. Source changes are local until deployed. Queue/backfill and unknown PDF layout validation remain incomplete. Never bulk-confirm heuristic tables to make coverage appear complete.
2. Native checkout defaults disabled. For an isolated preview tester set `PAYSTACK_NATIVE_MODE=test`, `PAYSTACK_NATIVE_ENABLED=true`, and `PAYSTACK_TEST_USER_IDS` to explicitly authorized account UUIDs. Keep test secrets out of VITE and Cloudflare. Do not expose Test Mode checkout to normal customers.
3. Complete card OTP fixtures, mobile/Safari and external signed webhook delivery testing before native live enablement. Simulated bank authentication, decline/recovery and success passed in the browser; these do not establish every bank/device path. Test callbacks currently use the configured local callback (Home), while the original checkout independently polls and confirms; pin the preview callback before hosted preview testing.
4. Card renewal additionally requires a server-only 64-hex AES key and `PAYSTACK_CARD_RENEWAL_ENABLED=true`. Keep disabled until recurring-card sandbox tests and cancellation/replay behavior are verified. Encryption-key rotation needs a planned token re-encryption process; changing the key blindly makes existing tokens unreadable.
5. No custom domain is attached. User explicitly said **do not use continua.africa yet**. Zone WAF, DNS/TLS/bot rules and paid products are deferred. Do not claim all Cloudflare products are configured. Existing preview/Vercel remain intact.
6. Gateway rate limit counters are regional, not a global quota. Direct Supabase authentication and Render origins need their own protections. Browser/mobile viewport resizing was not effective in the available browser session; actual iPhone visual verification is outstanding.
7. `SCRAPER_ADMIN_API_KEY` defaults absent (origin admin routes fail closed); provision a scoped operator secret before using manual crawl/reprocess endpoints. Scheduled/public bounded refreshes continue independently.

## Sources

- https://paystack.com/docs/payments/payment-channels/
- https://paystack.com/docs/api/charge/
- https://paystack.com/docs/payments/test-payments/
- https://paystack.com/docs/payments/recurring-charges/
- https://developers.cloudflare.com/waf/rate-limiting-rules/

No production billing enablement, primary-hosting cutover or Vercel removal was performed by this work.
