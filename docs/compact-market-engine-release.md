# Compact Markets and Engine workspace

## Product changes

- Markets has one horizontally scrollable navigation row: Overview, Bonds, Watch List, Heat Map, Calendar, All Stocks. Overview keeps the former Stocks section order, followed by market breadth and Kenyan sectors. The map is removed.
- Product sections use 8px gaps; market rows and comparison tables retain readable two-line rows. Comparison metrics have a 160px minimum column, company columns 140px, and horizontal overflow stays inside the table.
- Monitoring includes earnings growth, cash conversion, dividend payout and quote age, check-now, checked/input dates, unavailable-input states and owner-scoped alert history. Automatic checks run every ten minutes when the worker is enabled and running. Notifications are in-app, premium-only and respect Engine preferences. No email or browser push delivery is claimed.
- Journals keep five thesis snapshots, an evidence log and JSON export. They remain private device-only records, not cloud backups.
- Peers offers a single-metric two-company comparison with reporting-period/currency matching; no overall winner is inferred. Scenario lab adds growth sensitivity; technical readouts include dated evidence and average separation.
- Ask Engine has deterministic evidence mode when no OpenAI key is configured. It reads supported reported fields, cites records and states its limits; it is not an arbitrary-question chatbot or generative AI.

## Reliability

Company loads coalesce simultaneous requests. Portfolio optional persistence shares a four-second deadline and cannot prevent priced holdings from loading; incomplete persistence withholds returns. Engine transport gets a 45-second deadline including response body reading, and GET queries may retry one transient failure. Writes are not automatically replayed. These changes do not guarantee availability during provider outages or sleeping hosting instances.

## Deployment required

The repository's Edge Function workflow does not apply database migrations. Existing rule records are retained. On 8 October 2026 (Africa/Nairobi), the production Supabase project was inspected through its SQL dashboard: `engine_monitor_rules_kind_check` already contained all nine kinds from `20261007230000_engine_monitoring_tools.sql`. No migration rerun or record changes were necessary.

The live backend health endpoint returned HTTP 200 with database and cache checks passing, but quote freshness degraded (70/70 active quotes older than fifteen minutes). The monitoring activity request without credentials returned HTTP 401; this confirms the authentication boundary responds, not that the authenticated feature works. Browser preflight returned HTTP 204 and allowed the production frontend origin.

After the user signed in, the live Journal displayed its checklist, evidence log, thesis snapshots and export controls. Authenticated Engine data checks could not complete in the Codex in-app browser: opening the backend health URL reported `net::ERR_BLOCKED_BY_CLIENT`, while terminal requests succeeded. Premium Engine/portfolio/check-now and alert delivery still need verification in an unrestricted normal browser; isolated browser fixtures are not proof of production delivery. No credentials were exported and no browser security restrictions were bypassed.

## Phone connection failure follow-up

The user's phone screenshots also show failed Portfolio and Monitoring refreshes, so this is not established as an in-app-browser-only issue. The Render dashboard confirms backend commit `6f0657d` is live. Application logs on 8 October show `/engine/portfolio` returning HTTP 200 at 00:38, 00:42, 00:43 and 00:45 Nairobi time (10.7–14.9 seconds), and monitoring/history returning HTTP 200 at 00:44 (1.3–2.0 seconds). No matching CORS rejection was found in the last-hour window. Successful responses in that window do not identify which browser received them, nor establish the cause of the failed requests. Render request-level logs are unavailable on this service tier.

Cached portfolio results are now explicitly labelled as the last successful load after a failed refresh. Alert history no longer claims there are no alerts when its refresh fails, and provides a retry button. Isolated mobile tests inject failed reads and verify both error states and subsequent recovery. These display fixes do not claim to resolve the underlying intermittent connection. A backend-health check from the affected phone/browser is the next diagnostic step; do not disable CORS or hosting protection, replay mutations, or change hosting plans without evidence and authorization.

The affected phone successfully loaded backend health at 01:00 Nairobi time, with database/cache passing and stale quotes. This establishes public reachability at that moment, not cross-origin/authenticated access. The client previously classified malformed successful JSON responses as connection failures; it now distinguishes protocol errors from interrupted body downloads and preserves real HTTP error statuses. An on-demand "Troubleshoot Engine connection" section tests public health and the selected Portfolio/Monitoring authenticated read (preferences for other tools). Its report includes only origins, endpoint, timestamp, failure stage and status—not credentials, account identifiers, response bodies or financial data. It performs no POST/DELETE requests. The actual cause of the phone's intermittent authenticated failures remains unconfirmed until that report is observed on the affected device.
