# MyStocks native collection

The operator explicitly confirmed MyStocks automated quote/history collection
permission in this task on 14 October 2026. This is separate from the earlier
KenyanStocks confirmation. It is not permission to bypass source authentication
or to invent unavailable values. Store the operator confirmation reference in
the source's `permissionReference` before collection. No hosted source setting
was changed as part of this implementation.

Python handles the bounded HTTP collection, HTML/JSON decoding and private R2
evidence storage; Go handles permission/schema-gated canonical quote publication.
This uses the existing downloader's DNS pinning, verified TLS, robots checks,
source-domain policy, request throttling and response budgets. No Node forwarding
or signed-in browser session is used.

With source synchronization explicitly enabled, Go requests quote collection
every five minutes during the configured NSE session. The private source API
returns immediately and the collector owns the singleflight, throttled job.
Duplicate/cooldown requests do not repeat source downloads. A disabled collector
scheduler explicitly refuses the request rather than claiming that quotes were
collected. Canonical publication still reads separately validated, dated private
R2 extraction evidence; the asynchronous acknowledgement never grants freshness
or publishes raw SDK fields by itself.

Use separate source IDs with adapter `mystocks`:

- `collectionMode: "quotes"` (default): lightweight non-durable observations,
  two workers maximum, 30-second cache-buster buckets.
- `collectionMode: "history"`: durable leased document jobs, batch 20, two
  workers maximum, `historyDays` integer 1–3600 (default 360). Completed stable
  document URLs use the existing seven-day queue rediscovery policy, not quote
  polling. Date windows are recorded in document context. Source page and chart
  bodies are archived through the existing R2 evidence path before extraction.

History obtains an anonymous source-owned chart session from the issuer's public
historical page. It does not use account cookies, passwords or customer tokens.
The source-specific header is accepted only by the source-policy downloader.
Chart observations remain `historical_close_candidate`, with unavailable volume
represented as null and no invented O/H/L. They require review; this collector
does not write them as canonical OHLC candles.

Public source inspection:
[KCB quote/history page](https://live.mystocks.co.ke/stock=KCB).
Its delayed/public view displayed rounded volume on 14 October 2026. A rounded
value such as `3.52M` is not an exact count of shares: native exact-volume quote
publication rejects it rather than substituting zero or 3,520,000. Numeric volume
and all other mapped fields still require schema checks and dated evidence.
The source array is undocumented; collection permission alone does not approve
its mapping. Publication additionally requires the explicit approved mapping
configuration and valid source-artifact provenance.

Fixtures verify signed price changes, missing/future/range rejection, rejection
of rounded volume as exact, alias handling, bounded history windows, source-only
session transport, session cleanup, and close-only history. These fixtures do not
claim a full live history round trip or deployed production collection.

Unchanged quote snapshots retain one actually fetched URL per source ticker,
not one URL per transport nonce. Identical bytes returned for different issuers
still get independently scoped extractions. Publication checks the extraction's
ticker against the retained source URL or its actual-URL aliases, and chooses
the newest valid source observation rather than the most recently fetched hash.
Malformed or future source timestamps cannot displace a valid observation.
