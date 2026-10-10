# Paystack test setup

Configured through the Paystack dashboard on 10 October 2026.
Business remains in **Test Mode**; no live activation or service agreement submitted.

## Business profile

- Country: Kenya
- Industry/category: Digital goods / Digital - software applications
- Business type: Starter Business (not yet registered)
- Team size: 1–5 people
- Projected annual sales: KES 96,000

The revenue figure is a provisional assumption authorised by the owner, not
reported revenue: ten Premium customers paying KES 800 monthly for twelve months.
Profile is saved; contact, owner, account and service agreement remain incomplete.

## Test plans

| Plan | Amount charged (KES) | Interval | Test plan code |
| --- | ---: | --- | --- |
| Premium monthly | 800 | Monthly | PLN_60lb2n89pywowu9 |
| Premium annual | 7,980 | Annually | PLN_qb4jtzquhujqirk |
| Premium Plus monthly | 1,000 | Monthly | PLN_eucc288jw6heoc0 |
| Premium Plus annual | 9,960 | Annually | PLN_xf1egmwn7j802ei |

Plus annual is KES 830/month equivalent with one KES 9,960 annual charge (17% off).
All four plans were verified as having zero subscriptions and zero revenue.
No payment page was created and no customer was charged.

These are test identifiers only. Create separate live plans after approval;
never use these identifiers or a test secret key to activate real paid membership.
Recurring plan billing is for supported payment channels; do not promise M-PESA
auto-renewal. Its renewal flow must use customer-authorised one-time payments.

## Test integration implemented locally

The backend creates authenticated, server-priced one-time test orders.
`POST /api/v1/billing/checkout` returns a hosted Paystack link.
`GET /api/v1/billing/verify/:reference` verifies ownership, amount, KES currency,
test domain, customer email and metadata before saving an isolated test receipt.
`POST /api/v1/billing/paystack/webhook` checks HMAC-SHA512 against the raw body,
then independently verifies the transaction. Repeated success events are idempotent.
No test route changes profiles or grants real membership. The old mock upgrade
function is retired with HTTP 410. Email receipt delivery is not enabled.

Apply `20261010180000_paystack_test_checkout.sql` to a development database,
then privately configure the backend's ignored `.env.local`:

```dotenv
# Preserve your existing test secret; never commit this file.
DATABASE_URL=your_private_development_database_connection
PAYSTACK_TEST_CHECKOUT_ENABLED=true
PAYSTACK_CALLBACK_URL=http://localhost:8080/upgrade
```

The callback must point to the frontend using this same test backend.
Live keys are explicitly refused. Hosted test checkout requires explicit opt-in,
a test secret, and an HTTPS callback URL. Checkout uses one-time
payments, not the dashboard recurring plans, so no automatic renewal is promised.
For webhook testing, use a publicly reachable HTTPS test backend and set the
dashboard's Test Webhook URL to its `/api/v1/billing/paystack/webhook` endpoint.
The existing hosted backend can be used only with these isolated test routes
explicitly enabled. Localhost cannot receive Paystack webhooks.

## Remaining setup

Validation on 10 October: read-only authenticated Paystack plan lookup passed;
Premium Plus annual amount/currency/interval matched. Backend build, frontend
typecheck/build and 38 payment/Engine access tests passed. No payment was created
or charged. Local DATABASE_URL is missing, so database migration and end-to-end
checkout/webhook testing have not run. Changes have not been deployed.

That initial missing-connection status was resolved in the subsequent setup below.

Subsequent setup: the owner supplied the Supabase connection privately and
approved applying the isolated migration to the existing app database.
`20261010180000_paystack_test_checkout.sql` was applied transactionally and
recorded in `supabase_migrations.schema_migrations`. Verified: RLS enabled,
anonymous/authenticated table privileges blocked, service-role read/write access
present, and zero test orders. Existing memberships and app data were untouched.
Local test checkout remains disabled; callback configuration and end-to-end
testing are still pending. No payment code has been deployed.

Test API keys already exist in the dashboard. The secret key was not revealed,
copied, regenerated or stored by the agent. Callback and webhook fields remain
blank until a publicly reachable test backend is deployed.

The owner can privately add `PAYSTACK_SECRET_KEY` (the test key) to
`backend/.env.local`, without replacing existing environment settings.
Do not paste the secret into chat, commit it, place it in a frontend variable,
or deploy it as a production payment key.

Before live launch, implement live invoice records, membership expiry and renewal
handling. Only verified successful live payments
may grant time-limited paid access. Test mode must stay isolated from real customer
entitlements. Email delivery will be configured separately.
