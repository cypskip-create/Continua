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

## Deployed follow-up and live verification

The owner additionally requested onboarding/profile photo repair, X-style photo
previews and full-screen viewing, tiny gallery indicators, and editable/removable
investing experience. The implementation is committed in `09e5137`.

- Camera originals up to 20 MB are checked by raster signatures, normalized and
  resized before the 5 MB upload limit; avatar crops are centered. Supported HEIC
  decoding depends on the browser. Unsupported formats show an error. GIFs retain
  animation and their 5 MB limit. The obsolete 1.8 MB post-preview rejection is gone.
- Onboarding no longer hides upload errors, uses an accessible photo-picker button
  and permits retrying the same file. The profile editor uses uploads instead of a
  raw avatar URL field. Handle availability uses a session-guarded boolean RPC,
  including handles on non-public profiles; database uniqueness remains authoritative.
- Investing experience can be Beginner, Intermediate, Advanced or Professional.
  Not shown and Remove investing experience save `trading_experience=NULL`.
  These controls do not call account deletion or change other profile fields.
- Photo previews show up to four tiles and an overflow count. The existing five-photo
  allowance remains. All photos open in the full-screen gallery with arrows, swipe,
  zoom/pan, keyboard navigation and tiny 4–6 pixel dots inside larger touch targets.
  Composer previews can be opened, reordered and removed before posting.

Actual components were tested in a localhost-only harness with mock profile/identity
persistence and in-memory media storage. Browser tests changed and removed experience,
uploaded photos through both editors, checked reserved handles, opened the gallery,
measured dot sizes and verified that one arrow key advances one photo. No production
profile was modified by these UI tests. All 177 frontend tests passed.

Production Google sign-in passed through the real chooser/callback and returned the
existing owner account to Home. Managed user count remained two. All four supplied
website images were compared byte-for-byte with their deployed copies.

News refresh run `40172273076` succeeded. Production news grew from 892 to 916 rows;
the newest ingested publication was `2026-10-25T05:00:00Z`. The public financial-news
feed also advanced beyond October 21 while retaining its relevance/review filters.

Worker tracing found why queued media cleanup failed: Workers rejects `redirect:'error'`.
Commit `fd1deee` uses manual redirects and explicit status checks for queue/receipt
requests, without following redirects or forwarding maintenance credentials elsewhere.
The regression fixture matches this platform restriction. Final object-deletion
completion is determined by cleanup receipts, and diagnostic schedules are restored
to the original hourly trigger. The protected R2 financial-document credentials were
not broadened to access the public media bucket.

Following permanent legacy deletion, rollback must retain managed Auth. Restoring
deleted legacy identities from backup requires a new explicit restoration request;
the earlier pre-deletion rollback plan must not silently recreate those accounts.

Photo behavior references: [X photo posting](https://help.x.com/en/using-x/posting-gifs-and-pictures)
and [X image accessibility](https://help.x.com/en/using-x/add-image-descriptions).
This work does not claim parity with unrelated video, tagging or filter features.
