# Legal-risk and authentication-abuse review

Reviewed 12 October 2026. This is an engineering risk-reduction report,
not legal advice, certification, a complete penetration test or a guarantee
against lawsuits. Social-media penalty examples are not automatic liabilities
and mix jurisdictions. The operator needs Kenyan counsel to assess actual
activities, jurisdictions, registrations and contractual/data obligations.

## Primary sources

- [FTC COPPA FAQ](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions): scope depends on child-directed services or actual knowledge, not merely absence of an age checkbox. An adults-only self-attestation is not verified age or complete child-privacy compliance.
- [FTC CAN-SPAM guide](https://search.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business): commercial email requires accurate sender information, valid postal address and working opt-out handling; distinguish genuine transactional messages from promotion.
- [U.S. Copyright Office Section 512](https://www.copyright.gov/512/) and [agent directory FAQ](https://www.copyright.gov/dmca-directory/faq.html): designated-agent registration is only one element of safe-harbor requirements; public contact details, notice handling and repeat-infringer procedures also matter. Registration requires operator information and renewal.
- [ODPC rights and principles](https://www.odpc.go.ke/rights-of-a-data-subject/): transparency, purpose limitation, data minimisation, retention, data-subject rights and cross-border safeguards.
- [CMA licensing overview](https://www.cma.or.ke/overview-2/): investment-adviser and other regulated activities can require licensing. Calling functionality “research” or adding disclaimers does not determine regulatory classification.
- [Supabase auth limits](https://supabase.com/docs/guides/auth/rate-limits), [CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha), [password security](https://supabase.com/docs/guides/auth/password-security).
- [Cloudflare rate-limiting guidance](https://developers.cloudflare.com/waf/rate-limiting-rules/best-practices/) and [Turnstile embedding](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/).
- [Fontsource](https://github.com/fontsource/fontsource/blob/main/README.md): first-party font assets; preserve package/font licences.

## Implemented and checked

1. Bundled Inter Latin fonts replace the Google Fonts CSS request. Other glyphs use fallbacks; no Google Fonts host remains in that stylesheet.
2. Optional Vercel page analytics removed. No session-replay integration was found in the inspected app source; this is not a guarantee about infrastructure/provider logs.
3. Explicit adult/Terms checkboxes for new email signup and Google sign-in, no full birth date collected. Email signup stores self-attested policy-version metadata. OAuth declarations are currently a UI gate, not a server-side signup hook or immutable consent ledger.
4. Public Terms, Privacy, Billing and Copyright reporting pages, linked from auth, checkout, Settings and website footers. These are operator-facing policy drafts requiring legal/identity review, not verified regulatory compliance.
5. Exact single-payment amount, access period, manual renewal and tier-switch disclosure immediately beside each paid checkout action. An unchecked acknowledgement is required for the selected plan/cycle; changing cycle resets it.
6. Server requires the current checkout-policy version and explicit acknowledgement; new orders record the server acceptance timestamp and policy version. Older orders remain NULL, not retroactively “accepted.” No payment/refund is executed by this rollout.
7. Settings asks only for card last four / M-Pesa last three digits; no full card number, expiry, full phone, PIN or CVV. Saved labels are correctly described as references that cannot bill the user.
8. Existing partial community export is labelled accurately and cannot claim success when any query fails. Other privacy requests go to the actual configured support contact; a full-account export is not asserted.
9. Backend per-IP limits run before API/session verification for Engine, billing and admin requests. Health and signed Paystack webhooks use separate handling. This limiter is in-memory and not a distributed WAF.
10. Malformed/oversized JSON gets safe 400/413 responses; parser error bodies are not logged as generic error objects. Advanced research request bodies have a bounded 512KB limit.
11. Optional Turnstile widget/token forwarding implemented for password login, email signup and password reset. Unconfigured sites do not load Cloudflare scripts. Supabase must enforce token verification to stop direct-endpoint bypass; no CAPTCHA is enabled without matching configuration.
12. Live Supabase signup/sign-in IP rate limit reduced from 30 to 20 per five minutes; OTP/magic-link verification reduced from 30 to 10. Token refresh unchanged. IP forwarding stays disabled. CAPTCHA was observed disabled; enabling it remains a paired-key deployment task.
13. Legacy news dialog no longer invents expert quotations, KES inflows, analyst recommendations or demo commenters from a short summary. Local comments are labelled session-only, not published.
14. Unsupported “3 AI theses/month” entitlement removed from upgrade copy; paid-provider availability is not promised.
15. Native minimum password length set to 12 for new/changed passwords and secure password-change reauthentication enabled. Existing login passwords are not rewritten. Email confirmation and secure email change were already enabled and remain enabled. Leaked-password protection is paid-plan-only and was not enabled.
16. Account deletion clears the deleted account's local journals/app-lock references without deleting another account's device records. Storage failures are disclosed instead of promising complete local erasure.
17. Referrer headers suppressed; existing anti-framing headers supplemented with frame-ancestor/base/object CSP restrictions. This is deliberately not a full script/connect CSP or a penetration-test certification.
18. Inter's font licence is preserved at `/licenses/inter-OFL.txt` in the deployed assets.

## Marketing email: deliberately not enabled

No promotional email sender/campaign was found in the inspected backend,
scraper or Supabase function source. Do not add promotional copy to password
reset/verification or payment emails to bypass marketing requirements.
Before enabling campaigns, implement separate opt-in and suppression storage,
a working unsubscribe endpoint/link (and one-click headers where required),
verified sender identity and the operator's **real public postal address**.
No fictitious address, unsubscribe link or legal agent is supplied here.

## Remaining operator/setup actions

- Supply the legal operator/business name and public business contact/address; have counsel approve the policy texts, refund handling, privacy purposes/retention and transfer safeguards. Do not publish a private home address without choosing to do so.
- Assess ODPC controller/processor registration obligations and DPIA requirements. Maintain actual processes for privacy requests, incident response and breach notifications.
- Obtain written classification advice from Kenyan counsel/CMA on the paid research/ratings/personalisation features. NSE data permission is not an investment-adviser licence.
- Retain NSE permission evidence and independently verify secondary-source permissions/terms, PDF redistribution, news/image rights and generated-brand assets. Public accessibility is not blanket commercial permission.
- For U.S. Section 512 reliance, review applicability, designate an actual agent, register at the [official directory](https://www.copyright.gov/dmca-directory/), publish the matching registered contact, and maintain legally reviewed notice/counter-notice and repeat-infringer procedures. The operator must complete declarations/payment; no registration has been performed or claimed.
- Set up a free Turnstile widget for the actual production hostname. Store its public sitekey as `VITE_AUTH_TURNSTILE_SITE_KEY` in Vercel; put the secret **only in Supabase's CAPTCHA configuration**, never Git/chat/client code. Deploy the matching frontend before enabling native CAPTCHA, then test signup/password/reset and token expiry. Do not use test keys in production.
- Cloudflare WAF/Bot Management on a domain requires control of that domain, a configured proxied route and compatible plan/rules. Current Vercel/Supabase default hostnames are not made protected by changing app code. Do not challenge Paystack webhook requests or scheduled ingestion; verify signed/authenticated paths separately. Supabase's own auth endpoint must be protected at Supabase, not only the website.
- Keep paid hosting/AI disabled as the user requested; no paid security upgrade or registration fee was charged.
- Review tax/eTIMS invoice obligations separately; a Paystack confirmation or app receipt is not automatically a statutory tax invoice.

## Verification and migrations

`20261012020000_checkout_policy_receipt.sql` adds nullable acknowledgement
fields without changing existing charges or memberships.
`backend/scripts/applyCheckoutPolicyMigration.js` supports transactional
dry-run/apply and migration-ledger verification.

Regression checks cover age/Terms acknowledgement, suffix-only references,
first-party fonts, analytics absence, checkout acknowledgement/version,
server-owned price, pre-auth request bounds and safe parser errors.

Final checks: frontend 80 tests passed; backend 350 passed, 6 integration
tests skipped. Frontend/backend type checks and production builds passed.
The backend suite required an unsandboxed rerun because the sandbox blocked
Vitest temporary-cache renames before test execution. Bundled font binaries
were confirmed in the production build. The migration was applied and its
ledger/columns verified; existing orders were unchanged. The operator has
confirmed that public legal identity/address details are not available yet.
