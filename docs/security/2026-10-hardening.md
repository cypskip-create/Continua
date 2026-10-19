# October 2026 security and Engine transparency release

The Cloudflare deployment keeps refresh credentials in Secure, HttpOnly, host-only cookies. Its exact Auth gateway checks same-origin requests and a custom CSRF header, pins the provider, bounds request/response bodies and never caches sessions. Access tokens remain in memory. PKCE verifiers alone use session storage; existing persisted refresh tokens migrate on a successful refresh. Other deployments use memory-only sessions until an equivalent same-origin gateway is configured.

CSP begins in report-only mode. The existing enforced framing/object restrictions remain. Reports retain only a bounded directive name, never page URLs or script samples. Review actual violations before enforcing the script policy.

Authenticator enrollment, challenges and verified email changes are available in Account security. Enrolled accounts must complete MFA before the app loads private providers. Restrictive SQL policies and explicit caller-facing definer-RPC guards enforce MFA for private reads and operations. Existing ownership policies remain. Engine APIs independently verify identity and MFA. Sensitive Auth changes and account deletion require recent authentication; device App Lock grants no server authority. Authenticator enrollment is a user action on their own device. Do not bypass a lost factor using a local unlock.

The public processing status counts only discovered, eligible, permission-backed files; it does not claim complete filing coverage. C score evidence includes calculation/reporting/price dates and source links where recorded, missing inputs, coverage and disclosed thresholds. No forecast or score is fabricated when evidence is insufficient.

CI runs dependency audits, tracked-file and built-browser secret checks, static analysis for Go/Python/JavaScript/Actions, native race tests, SQL authorization fixtures and a real disposable PostgreSQL pg_dump/pg_restore rehearsal. The rehearsal compares restored rows, queue versions, policies and RLS flags; it is not a production backup. Existing R2 originals and verified migration receipts remain recovery inputs. Render automatic deployment waits for passing CI. Failure receipts open a deduplicated GitHub issue and close it after recovery; no provider secrets or raw logs are copied there.

No native production cutover is authorized by this release. The native ledger still has partial features. Paid services, extra raw transfers above the approved budget and a broad repetition of the already confirmed account-isolation audit are outside this change.
