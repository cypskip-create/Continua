# Production fixes — 25 October 2026

The owner requested replacement artwork, Google login repair, faster app/feed
loading, unique handles, fresh news, and permanent removal of all seven legacy
accounts and their linked data. They explicitly selected permanent linked-data
deletion after the scope was clarified.

## Findings and implementation

- The live Auth asset `Auth-CDrRABSu.js` had no managed issuer literal, unlike
  the manually built artifact. It rejected the managed Google initializer.
  Production Vite now resolves its environment from the app directory and refuses
  an absent or incompatible managed provider/issuer. The root production build
  additionally checks the emitted Auth asset for the correct production issuer.
- The four supplied JPGs replace Engine, Portfolio, TradersHub and Stock Research
  imagery in that order. Their captions describe illustrations and example
  figures rather than claiming actual account screenshots.
- Anonymous managed session reads now finish at Cloudflare without waking Render.
  Public website/auth pages can render during session restoration. Concurrent
  protected reads share an in-flight provider session check for the same cookie;
  settled results are never cached. Each request still verifies JWT, local
  bindings, revocation, canonical owner and SQL session guards. Render Free's
  cold-start behavior remains an infrastructure limit for authenticated requests.
- Handles use 4–15 ASCII letters, digits or underscores, lowercase storage,
  at least one letter/digit, reserved official/admin names, and case-insensitive
  database uniqueness. Invalid characters are rejected rather than silently
  removed. Availability uses exact equality, avoiding underscore wildcard
  matching, and stale availability responses are cancelled. Generated aliases
  fit the same length limit. A SQL trigger/check/index protects direct writes.
- News collection was running, but durable FIFO batches of two articles were
  draining old RSS work. The queue contained October 24 articles while published
  news stopped at October 21. RSS claims now prioritize publication dates and use
  a separate default batch of eight. Document ordering, publisher access controls,
  retries, finite timeouts and existing daily/run transfer budgets remain intact.

## Approved legacy removal

Exactly seven legacy production identities were removed transactionally, with
seven profiles, 16 portfolios, 33 watchlists, eight folders and their cascading
dependent account records. Both managed users and their canonical/profile/
portfolio/watchlist rows were compared before and after and remained unchanged.
Media cleanup was queued for the seven legacy owner prefixes through the
existing bounded cleanup worker. No managed Auth user was deleted, and the
application's managed self-service deletion flag remains disabled.

Before deletion, 68 related tables/294 rows were encrypted with AES-256-GCM;
the key is protected using Windows DPAPI. Readback, decryption and every table
hash were verified. Backup SHA-256:
`2749012fcd2bd7a4c7c60e4df559f5611d52476b5fdfdb5b79a095d0ffc646ea`.
The backup and exact legacy target manifest remain in protected local storage.
This backup is not a claim of a rehearsed whole-service restore. The operation
did not contact or delete data in the old Supabase project.

## Validation before deployment

174 frontend tests, 25 focused backend tests, 40 edge tests and both type checks
passed. Focused Python runner/job/scheduled collector tests passed (31 cases);
the additional news-priority and RSS availability tests passed (four cases).
Nine temporary PostgreSQL handle tests passed and rolled back, including a
case-only uniqueness collision. The production build and browser secret scan
passed. Live deployment receipts and fresh-news checks are recorded separately
after deployment; this document alone does not establish their completion.
