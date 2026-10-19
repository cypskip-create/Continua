# October 2026 security and Engine transparency release

The Cloudflare deployment keeps refresh credentials in Secure, HttpOnly, host-only cookies. Its exact Auth gateway checks same-origin requests and a custom CSRF header, pins the provider, bounds request/response bodies and never caches sessions. Access tokens remain in memory. PKCE verifiers alone use session storage; existing persisted refresh tokens migrate on a successful refresh. Other deployments use memory-only sessions until an equivalent same-origin gateway is configured.

CSP begins in report-only mode. The existing enforced framing/object restrictions remain. Reports retain only a bounded directive name, never page URLs or script samples. Review actual violations before enforcing the script policy.

Authenticator enrollment, challenges and verified email changes are available in Account security. Enrolled accounts must complete MFA before the app loads private providers. Restrictive SQL policies and explicit caller-facing definer-RPC guards enforce MFA for private reads and operations. Existing ownership policies remain. Engine APIs independently verify identity and MFA. Sensitive Auth changes and account deletion require recent authentication; device App Lock grants no server authority. Authenticator enrollment is a user action on their own device. Do not bypass a lost factor using a local unlock.

The public processing status counts only discovered, eligible, permission-backed files; it does not claim complete filing coverage. C score evidence includes calculation/reporting/price dates and source links where recorded, missing inputs, coverage and disclosed thresholds. No forecast or score is fabricated when evidence is insufficient.

CI runs dependency audits, tracked-file and built-browser secret checks, static analysis for Go/Python/JavaScript/Actions, native race tests, SQL authorization fixtures and a real disposable PostgreSQL pg_dump/pg_restore rehearsal. The rehearsal compares restored rows, queue versions, policies and RLS flags; it is not a production backup. Existing R2 originals and verified migration receipts remain recovery inputs. Render automatic deployment waits for passing CI. Failure receipts open a deduplicated GitHub issue and close it after recovery; no provider secrets or raw logs are copied there.

No native production cutover is authorized by this release. The native ledger still has partial features. Paid services, extra raw transfers above the approved budget and a broad repetition of the already confirmed account-isolation audit are outside this change.

## Static-analysis triage

The first enabled main-branch scan reported 16 alerts. They are not silently dismissed or treated as proof of exploitation. The feed exclusion now parses an exact URL hostname rather than testing URL substrings, and the function deployment workflow explicitly limits its token to contents:read.

Remaining reviewed warning categories:

- Go SQL reader wrappers accept SQL assembled by internal store methods; HTTP values are bound as parameters. The reviewed-component builder uses a fixed field registry and private static arguments; JSON defaults contain only constant field names and nulls. No request value is inserted into its SQL text. These generic-wrapper/constant-quoting warnings remain visible for future review.
- SHA-256 is used for ephemeral cache indexing or constant-time comparison of high-entropy API/operator keys, not for password storage. Database API-key verification still uses scrypt. Substituting slow password hashing in every pre-auth request would add a denial-of-service cost without improving that comparison.
- Company Engine bundle persistence contains public issuer research, a tier hint and its owning account identifier, not an access token or personal portfolio/journal. It expires, is tier/owner-bound, and is removed on logout/account switch. User-owned journals have a separate explicit deletion flow.
- Billing routes inherit the mounted pre-auth, API and workload limiters. The separately mounted webhook has its own limiter before body parsing. Existing limiter/edge tests cover these boundaries; the route-local static warnings do not model the mounting stack.
- Test-only string assertions deliberately check that forbidden external fonts/payment redirects are absent. They do not validate or navigate user URLs.

Reassess these findings if their inputs, cache payload or route mounting changes. This release does not suppress these rules or claim an absence of all vulnerabilities.
