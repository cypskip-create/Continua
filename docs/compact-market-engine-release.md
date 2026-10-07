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

Deploy the frontend and backend and apply `20261007230000_engine_monitoring_tools.sql` to widen the monitoring-kind constraint. The repository's Edge Function workflow does not apply database migrations. Existing rule records are retained. Local database credentials were unavailable, so this migration was not applied to production during this change. Verify premium Engine/portfolio/check-now with a real authenticated account after deployment; isolated browser fixtures are not proof of production delivery.
