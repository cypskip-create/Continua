# Native implementation continuation

## Delivery status — 15 October 2026

The user now requests major regression checks followed by commit and push,
without waiting for exhaustive minor-feature tests. This changes the delivery
sequence, not the production cutover requirements or the meaning of a partial
ledger entry. The native implementation is a candidate, not a completed live
migration. Preserve the rollback until actual cutover is safe.

Completed validation includes native Go package tests, Python Engine and collector
unit tests, numerical/source reference comparisons, 63 owned-database read-only
API comparisons, disposable PostgreSQL Go transactions, and isolated Linux
container resource checks. Those checks do not establish every ledger item.
The latest collector PostgreSQL recovery test is also wired into CI. Its local
rerun is blocked because Docker's Linux daemon is currently unavailable.

The final local delivery run passed every Go package, 92 Engine tests, 103
collector tests (108 discovered, five explicit PostgreSQL integration skips),
11 Cloudflare edge tests, and Git whitespace validation. No live charges or
paid provider requests were made. These results are not a substitute for the
unresolved hosted/R2 and ledger gates below.

The native assistant now uses Go for authenticated, bounded Responses API calls
and budget accounting, and Python for evidence assembly and citation validation.
Existing-key reuse is authorized; paid AI remains explicitly disabled. Provider
tests use synthetic responses, not paid API calls. Windows collector subprocess
execution preserves database-compatible selector loops and bounded process cleanup.

Outstanding release gates include the unresolved/partial ledger entries, actual
private R2 upload/recovery verification, and hosted deployment checks. Render's
bandwidth suspension has not been resolved by authorizing paid hosting. Do not
claim this commit migrated production or verified those external systems.

Implementation scope (validation varies by component; see the ledger):

- Native Go NSE adapter/registry with bounded Python batch mapping, private
  authenticated Python HTTP transport and opt-in source-job startup wiring.
  Source capabilities remain literal: close-only feeds do not supply OHLCV,
  financial statements, corporate actions or ownership through this interface.
- Source synchronization for additive-only issuer discovery, fundamental history,
  corporate/earnings/ownership windows, deep candle backfills and daily top-ups.
- Corporate, fundamental, candle and index ingestion pipeline implementations.
  The approved-source quote and index publication jobs use native pipelines.
- Python nullable bundle normalization and touched-bucket candle aggregation.
- Private ingestion run/dead-letter coordination and changed-action suppression.
- R2 persistence of AFX/KenyanStocks discovery pages as well as issuer documents.
- Native atomic operator workflows for community safety, research expansion,
  historical-document infrastructure and candle provenance, including preserved
  rollback-only behavior probes. These were implemented, not executed.
- A separate close-only history model, bounded source-evidence publication,
  durable versioned completion receipts and authenticated price-history endpoint.
  Unknown OHLC/volume remain unavailable. Source mapping/adjustment approval is
  independent of collection permission and no approval was silently enabled.
- Native non-root candidate container definitions without Node. Images were
  built and isolated Linux checks run; production guards and loopback binding
  remain, and no native production deployment has occurred.
- Native Go reviewed visual-transcription API and operator client with private
  original/hash/permission checks, atomic multi-table publication, conflict
  refusal and explicit apply versus rollback-only validation.
- Native Go streaming history import, strict official research import and fixed
  read-only coverage/index/archive/payment-schema inspection commands.
- Native Python exact-source permission and news-removal operator workflows.
  These preserve source evidence and never silently enable collection/mapping.
- Runtime diagnostics, safe request correlation/panic handling and authenticated
  edge client identity; no edge secret was provisioned by this implementation.
- Explicit reviewed legacy-condensed filing repair, source licensing, bounded
  source/layout inspection, native startup configuration and request-limit parity.
- Nonblocking market-session quote refresh handoff to the collector's bounded
  queue, with singleflight/cooldown and honest disabled-scheduler receipts.
- Sparse issuer enumeration retains known registrations without manufacturing
  company names, sector assignments or listing dates for new issuers.

Preserve the existing production reference. None of these changes authorize
native production cutover. Complete source capability coverage, route/operator
implementation, remaining release requirements and the final validation phase
are still outstanding. Do not alter ledger status to imply they are complete.

No live charges, paid Render activation, new domain cutover or paid AI activation
is authorized by this continuation. Keep original PDFs and extraction snapshots
in private R2; Render is compute with bounded temporary staging only.


## 19 October: statistics and request protection

Native Python observed market statistics pass 216 full-response comparisons with
production: missing/mock/future quotes, actual zero volume, reporting dates,
currency, negative shares, sparse/gapped/conflicting closes and complete OHLC.
Go provides the validated cached route and bounded SQL inputs. Licensed publisher
and legacy provider observations remain close-only; unknown MyStocks volume is
null and these records are excluded from OHLC candle reads. A disposable
PostgreSQL regression checks those reader contracts in CI.

Native workload protection now shares one research scope across Engine,
statistics, history, valuation and research URLs. Verified users cannot reset
that scope by changing API keys. HEAD and exact transfer path segments retain
compatibility policy. Scoped IPv6 edge identities are rejected. These are
candidate changes; full rewrite and hosted release gates remain unresolved.


The native prepared-object reader now passed a read-only owned Cloudflare smoke
check using one 2,137-byte CGEN object, an immutable cached read and rejection of
a different issuer's identity. Deterministic tests verify four-fetch capacity,
provider-error redaction, corruption rejection and body/admission cleanup.
The registry refresh PostgreSQL fixture also passes with an actual active lease;
the native six-hour trigger preserves that lease while incrementing its version.
These checks do not enable production native cutover.
