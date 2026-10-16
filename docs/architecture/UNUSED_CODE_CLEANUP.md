# Backend and scraper cleanup — 16 October 2026

Scope: tracked backend/scraper JavaScript modules, imports (including literal
dynamic imports), package scripts, Docker entrypoints, operator scripts, tests,
native parity/inventory tools and indirect package loading. No production
configuration, frontend code, stored records or R2 objects changed.

## Removed

- `backend/src/services/portfolio/corporateActionAdjustments.js` and its `.d.ts`:
  no application, operator or test imports/calls. This was a repository-filter
  wrapper, not a mounted API. The existing Go adjustment implementation remains.
  The historical SHA and native release status remain in the migration ledger;
  its generator explicitly retains this retired reference without reading a
  deleted file. Removal is not evidence of completing that migration.
- `tsx` direct development dependency in both services: commands already use
  Node and Vitest; remaining CLI help/examples now point to existing `.js` files.
- Scraper `pdf-parse`, `pdfjs-dist`, their unused `@types/pdf-parse` package and
  the obsolete PDF override: PDF extraction uses isolated Poppler/Python, with
  the existing Tesseract OCR fallback, not these JavaScript PDF engines.
- Unreachable lock entries: 28 backend and 66 scraper package records, including
  platform variants. Retained package versions/integrities are unchanged.

## Retained deliberately

- Both `src/index.js` files are Docker/package entrypoints, not unused modules.
- `pino-pretty` is resolved by Pino's development transport string.
- `@tesseract.js-data/eng` is used as the local OCR language-data directory.
- Tests and `.d.ts` contracts still support development and parity validation.
- Active JavaScript production/reference code, native Go/Python code, operator
  commands, SQL migrations and the rollback implementation remain in place.

Prior cleanup already removed the two obsolete `tsconfig.build.json` files and
the one-time conversion script. All removed tracked files are recoverable from
Git. This audit does not claim that dynamic runtime use can always be inferred
from static imports; candidates were checked against explicit and indirect use.

Analysis used the already-installed JavaScript/TypeScript parser API locally;
no TypeScript implementation or runtime dependency was added. See the official
[compiler API documentation](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API).

Validation: clean local installs from both pruned locks succeeded; 38 backend
portfolio/research tests, 17 scraper PDF/table/storage/access tests and four
Render isolation tests passed. Both service builds passed. The retired wrapper's
two stale, ignored local `dist` outputs were also removed; Docker builds use a
fresh build stage. Root/frontend PDF dependencies are outside this cleanup and
were not removed. There were no live database writes or provider/payment calls.

Pre-push full-suite check: 400 backend tests passed (17 skipped by their existing
configuration), all 88 scraper tests including OCR passed, and all four Render
isolation checks passed. Both JavaScript service builds passed from the pruned
dependency installations. No additional unused runtime modules were found beyond
the retired wrapper; direct entrypoints and test files are not deletion candidates.
