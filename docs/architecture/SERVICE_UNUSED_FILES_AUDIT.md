# Backend and scraper unused-file audit — 16 October 2026

Scope: tracked `backend/` and `scraper/` source files, deployment entrypoints,
operator scripts, test discovery and TypeScript declaration consumers.

Removed these empty generated files (each contained only `export {};`):

- `backend/src/index.d.ts`
- `scraper/src/index.d.ts`
- `scraper/src/extraction/nseIndexSummary.test.d.ts`

They are recoverable from Git. No service implementation, data, credential,
financial validator or test was deleted.

The read-only audit `node tools/audit-service-files.mjs` finds:

| Service | JavaScript runtime modules | Executable TypeScript under src | Unreferenced JS candidates |
| --- | ---: | ---: | ---: |
| Backend | 200 | 0 | 0 |
| Scraper | 58 | 0 | 0 |

After removal, neither service has unreferenced declaration-file candidates.

Reachability is conservative: entrypoints, operator tools and actual test roots
all count as consumers. This is not a claim that every exported function runs on
every request. Dynamic references and external consumers require review before
deleting public contracts.

`registry.d.ts` is NOT a second registry implementation. It declares the types
of `registry.js`, and TypeScript resolution/typechecking consumes it. The backend
price, index, financial, candle and corporate-action workers import the JS
registry; the scraper scheduler imports its JS registry. Remaining declaration
contracts and test files are retained. The scraper's `.test.js` under src is
explicitly included by `scraper/vitest.config.mjs`, not an unused build artifact.

Both Dockerfiles still launch `node dist/index.js`. Native production cutover
remains blocked by `docs/architecture/NATIVE_REWRITE_LEDGER.json` and the Go
entrypoint's production guard. Therefore the remaining JavaScript implementations
cannot honestly be described as unused replacements for Go/Python yet.

Ignored `.qa-artifacts/language-migration/` files are migration snapshots outside
the two service source trees, not deployed TypeScript implementations. They were
not deleted as part of this tracked source cleanup.

Verification baseline: backend typecheck passed. Scraper typecheck already failed
before cleanup at `tests/lightIndexRecovery.test.ts:18` and `:20` (TS2532).
After cleanup, backend typecheck passed, scraper reported exactly the same two
pre-existing diagnostics, and both service builds passed. No new typecheck
failure was introduced by the deletions.
