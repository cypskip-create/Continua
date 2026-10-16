# Post-collection publication

R2 retains private immutable source evidence. Python collection also writes
extractions and issuer context to Supabase. Existing backend workers poll these
records independently of collection; an R2 upload alone is not publication.

Registered native-text report layouts pass issuer, accounting, period, unit and
conflict checks before canonical statement publication. Unsupported layouts and
OCR remain review items. The app's financial history/chart readers use canonical
periods; publisher-observed financial tables remain separately labelled rather
than silently replacing filings. News and announcements have independent bridges.

New automatically published financial validations now include a durable research
refresh request in the same transaction. Every document-publication tick claims
up to five due requests, recomputes research, invalidates financial and Engine
caches, then acknowledges completion. Missing quotes, missing inputs, computation
or cache failures leave work pending. Ten-minute claim expiry allows recovery
after crashes. This outbox repair needs no new table, public R2 access or report
download on Render. Old audit rows without these flags are not retroactively scheduled.

## All-tab processing

`engine-python/continua_engine/collected.py` processes collected views into:

| Publisher view | Destination and processing |
| --- | --- |
| Summary | Overview facts, labelled tables and year series |
| Financials, every discovered category | Raw labels/units, numeric cells and chronological chart series |
| Statistics | Source metrics, visible chart snapshots when supported, source-labelled cards |
| News | Attributed HTTPS headlines/excerpts, publisher and original date fields |
| Corporate Actions | Source tables/cards; no invented ex-dates or dividends |
| Historical Data | Validated, sorted OHLCV; conflicting dates withheld; rounded volume identified; adjustment unknown |
| Holders | Named holders and literal shares/ownership/value columns; no invented value multiplier |
| Files | Public source PDF manifest, never private R2 credentials or object URLs |
| PDF, any layout | Page/section classification, extracted tables and explicit review state |
| Newly discovered tabs | Additional research with the same generic table/card path |

All registered PDF sources can enter the document path. An exact source ticker
or unique issuer masthead is required; issuer conflicts are isolated for review.
An unknown/scanned layout is processed and indexed, **not automatically certified
as an audited financial statement**. The existing strict canonical validators
continue to decide which values can affect valuation, ratios and entitlements.
No system can safely guarantee automatic interpretation of every unseen layout.

`scraping.processed_research` holds versioned receipts and prepared payloads.
It is RLS-protected with no anon/authenticated table grants. A transaction claims
one extraction at a time with `FOR UPDATE SKIP LOCKED`. Failures roll back; retries
do not create duplicate publications. Newly granted rights/catalogue membership
can unblock prior blocked records. Disabled/revoked sources are filtered again
when read, even if processing happened before revocation.

Actions explicitly applies the additive migration and processes 25 existing
extractions before collection and 25 after. This runs for both scheduled news and
document jobs, including when collection reaches its transfer budget. A manual
`maintenance=process-research, apply=true` drains up to 100 existing extractions
without downloading source files or reading R2 originals. Finite batches are
intentional: completion of one run does not mean the entire backlog is drained.

The existing backend exposes `/api/v1/financials/:symbol/collected-research`
and includes `publisherResearch` in full Engine bundles. The native Go candidate
has an equivalent issuer-scoped reader; production API runtime is not switched.
Both readers recheck source permission, digest and private-evidence provenance.
The new endpoint is `no-store`. No frontend redesign is part of this change;
prepared datasets are available to app consumers, not a claim every screen has
already adopted new sections.

The endpoint uses `limit` (1–100, default 20) and `offset`, returning a
`pagination.nextOffset` continuation for older documents. It does not silently
make records beyond the first page unreachable.

Archive reprocessing now retains issuer/tab metadata. Collector parser v0.5.0
adds non-table cards, definition-list facts, PDF manifests and visible Chart.js
snapshots; old archives may need a queued refresh to acquire missing DOM facts.
Each reserved collection run also upgrades at most two older R2 HTML views using
the checksum-verifying reprocessing service. These reads use the same transfer
budget; the DB-only maintenance action cannot download originals. Upgrade
failures rotate through dead-letter timestamps rather than blocking collection.

Verification before deployment: 11 pure Engine tests, 27 targeted backend tests,
the scraper suite (6 optional DB-fixture tests skipped), and native Go marketdata,
HTTP API and publication packages. Production execution and visual app updates
must be recorded separately from these local results.

## Live receipts, 16 October 2026

Actions run `38910236608`, revision `a99efc4`, applied the additive schema and
processed 100 records: 7 empty legacy-format document views, 93 blocked by absent
verified private evidence, zero infrastructure failures, zero source/R2 downloads.
KenyanStocks inventory: 689 extractions, 39 with private R2 evidence, 689 permission
ready and 541 ticker-scoped/known issuers. This is evidence of working DB processing
and gates, **not** proof that the publisher backfill or canonical financial
publication is complete. The format-upgrade path addresses old empty views;
remaining originals must actually reach R2 before their data is eligible.
