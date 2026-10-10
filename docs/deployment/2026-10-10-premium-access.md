# Premium access revision

Premium now includes the full company research desks: Briefing, Forecast,
News, Earnings & Reports, Valuation, Ownership and Evidence. All expanded
Fundamentals Forecast tools are also Premium, including rating research,
price paths, risk, growth and scenario details. These use verified server
subscription checks; a client-side paid-looking profile cannot bypass them.

Premium Plus retains the standalone Technicals, Scenario lab and Peers desks,
plus Portfolio, Monitoring, Journal, Ask Engine and Preferences. The personal
workspace APIs retain their Premium Plus checks. Fundamentals scenario tools
are deliberately available to Premium; the Engine's separate Scenario lab is Plus.

Home AI insight and stock-news AI summaries are removed. Old clients calling
those stock-thesis modes receive HTTP 410 without an AI-provider request.
The separate investment thesis feature is unchanged by this request.
No schema migration is required. Deploy frontend, backend and stock-thesis
together to release these changes.

## Payment recommendation (researched 10 October 2026)

Recommend Paystack Kenya for the first integration: M-PESA and cards in one
checkout, card subscription billing, and invoice/payment-request support.
M-PESA is **not** an automatic recurring channel on Paystack. Offer monthly
renewal prompts or an annual payment for M-PESA, never promise automatic debits.
Premium Plus remains KES 1,000 monthly or KES 9,960 charged once annually
(KES 830 monthly equivalent, 17% discount).

Implementation should create orders server-side, verify payment status, amount,
currency and purchaser server-side, and process authenticated webhooks
idempotently before granting time-limited membership. Failed or pending payments
must not activate a plan. Record invoice/receipt references against each successful
payment. Email delivery can be configured separately; verify local tax-invoice
requirements before calling payment receipts tax invoices.

No payment provider is connected and no merchant account or subscription was
created. Merchant onboarding and provider selection remain user decisions.
Pesapal is a credible alternative with API 3.0 recurring-payment documentation;
confirm merchant eligibility and supported recurring channels with it first.

Sources:
- https://paystack.com/ke
- https://paystack.com/docs/payments/subscriptions/
- https://support.paystack.com/en/articles/2128322
- https://support.paystack.com/en/articles/2130882
- https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json/recurringpayments
