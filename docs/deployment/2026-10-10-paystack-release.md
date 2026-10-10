# Hosted test checkout and Premium access release

Release scope: expanded Premium company Engine access, unchanged Plus workspace
gates, removed home/news AI summaries, and isolated Paystack test checkout.
The mock subscription-upgrade edge function is retired and returns HTTP 410.

Validation: 59 frontend tests and 39 payment/Engine access tests pass. The
Paystack annual Plus plan was verified by authenticated read-only lookup.
The isolated test-order migration is already applied and recorded in Supabase;
RLS and anonymous/authenticated privilege checks passed. Do not rerun unrelated
migrations as part of this release.

Hosted backend environment requires `PAYSTACK_SECRET_KEY` (test key only),
`PAYSTACK_TEST_CHECKOUT_ENABLED=true`, and
`PAYSTACK_CALLBACK_URL=https://continua-cypskip-creates-projects.vercel.app/upgrade`.
Keep `NODE_ENV=production`; live keys and live-domain transactions are refused.
Never add the secret to Vite, source control, build commands or documentation.

Paystack Test Webhook URL:
`https://continua-backend.onrender.com/api/v1/billing/paystack/webhook`

Test checkout is available to signed-in accounts, including accounts already
subscribed. Buttons explicitly say Test checkout. Provider redirects are trusted
only on checkout.paystack.com. Callback verification checks account ownership,
provider mode, amount, currency, email and metadata. Successful test payments
save isolated receipts, never profiles or real subscription access. One-time
payments only; live billing, invoices, email delivery and renewals are not enabled.

Merchant compliance is still 1 of 5: Profile complete, Contact/Owner/Account/
Service agreement pending. Do not activate live payments or accept the service
agreement as part of deploying this test release.
