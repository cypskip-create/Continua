# Live Paystack billing release

## Prices and live dashboard plans

| Tier | Cycle | KES charged | Live Paystack plan |
|---|---|---:|---|
| Premium | Monthly | 800 | PLN_atxx9d8kpmjw924 |
| Premium | Annual | 7,980 | PLN_6kb42hl8zn45zsd |
| Premium Plus | Monthly | 1,000 | PLN_aegymsim6on5gmk |
| Premium Plus | Annual | 9,960 | PLN_zb2whutfo0l1max |

Plus annual is KES 830/month equivalent, billed once annually (17% off).
Dashboard plans are catalog definitions only. App checkout deliberately does not
pass a Paystack plan code: renewals are customer-authorized one-time purchases,
including M-PESA, not automatic recurring charges. Standalone subscription pages
must not be published until their payments can be linked to authenticated orders.

## Stable production URLs

- Website: https://continua-cypskip-creates-projects.vercel.app
- Callback: https://continua-cypskip-creates-projects.vercel.app/upgrade
- Webhook: https://continua-backend.onrender.com/api/v1/billing/paystack/webhook

Set the callback/webhook in Paystack's live developer settings. Backend settings:
`PAYSTACK_SECRET_KEY` (private live secret), `PAYSTACK_LIVE_CHECKOUT_ENABLED=true`,
`PAYSTACK_TEST_CHECKOUT_ENABLED=false`, and `PAYSTACK_CALLBACK_URL` as above.
Never commit a secret, put it in a Vite variable, or paste it into chat.

## Migration and security

Migration `20261010210000_paystack_live_checkout.sql` adds a protected live order
ledger and `profiles.subscription_expires_at`, without changing legacy memberships
or test receipts. Callback and signed webhook independently verify the transaction
via Paystack: live domain, exact server price, KES, reference, email and owner metadata.
Only successful verified charges reach atomic, row-locked database fulfillment.
Duplicate callback/webhook delivery returns the original receipt without extending
access again. Same-tier early renewal extends remaining access; switching tiers
starts a new term with no prorated credit, disclosed before checkout. Active Plus
cannot initiate a lower-tier purchase. A late lower-tier payment cannot downgrade Plus.

Receipts include amount, reference, receipt number and membership expiry in the app.
Email delivery is not configured. No reusable card authorizations are stored.
Refunds/disputes require merchant review; automated refund/chargeback entitlement
reconciliation is not part of this release. Do not enable automatic Paystack plan
subscriptions: their renewal events aren't app-owned orders in this implementation.

Database cron expires memberships every minute, including while Render sleeps.
Engine middleware, research quotas, long-form post and watchlist triggers use
expiry-aware access. Legacy manually granted paid tiers with no expiry remain intact.

## Deployment validation

- `backend/scripts/applyPaystackLiveMigration.ts --validate` validates then rolls back.
- `--apply` applies exactly this migration and records its Supabase migration ledger entry.
- Both paths test activation, repeat verification, early renewal and expiry with a
  synthetic user rolled back to a savepoint. They print only safe verification flags.
- Live/test payment and Engine access unit tests: 50 passing.
- Frontend regression tests: 59 passing.
- Never submit a real payment during deployment checks. The owner performs that final test.

## Key rotation requirement

During Render environment editing, browser accessibility output unexpectedly
included credential values despite visually masked controls. Rotate the exposed
live Paystack secret before accepting real payments, replace it privately in Render,
then enable `PAYSTACK_LIVE_CHECKOUT_ENABLED`. Checkout must remain disabled until
that rotation is complete. Do not record old/new key values in documentation.
