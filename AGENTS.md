# Continua implementation preferences

Before implementing a requested feature or migration, research suitable languages
using current primary documentation. Assess the feature's workload, numerical
requirements, supported libraries, deployment limits, security, integration and
maintenance costs. State and record the selected language and concrete rationale.
Do not force TypeScript or add another runtime simply for variety.

For backend, Engine and scraper implementations, the user requested replacing
TypeScript. The user subsequently requested a full native-runtime rewrite:
Go for backend API/auth/billing/streaming/jobs, Python for Engine and scraper,
and retained SQL guarantees. The deployed JavaScript/Node implementation is the
compatibility reference and rollback, NOT completion of this full rewrite.
Supabase platform entrypoints remain Deno-compatible JavaScript.
Existing non-executable `.d.ts` contracts and development
tests are not evidence of a TypeScript production runtime. Do not reintroduce
TypeScript implementation code without asking the user.

Keep language decisions feature-specific and maintain
`docs/architecture/FEATURE_LANGUAGE_DECISIONS.json`. A feature's best choice is
not necessarily a separate service; account for the 512MB/free Render budget and
IPC/startup overhead. Validate performance claims rather than attributing cold
starts, database latency or memory pressure to a source language without evidence.

Preserve every existing API, owner/entitlement rule, signed webhook, payment
idempotency guarantee, scheduled job, financial evidence/validation rule, missing
data behavior and source permission. Run behavioral and differential tests before
cutover. Do not substitute a forwarding proxy or syntax conversion for a claimed
from-scratch implementation in another runtime.

Keep paid AI and always-on services disabled unless the user explicitly authorizes
their configuration. Do not initiate real charges during tests. Direct merchant
card fields remain blocked until PCI-DSS compliance and Paystack approval exist.

Frontend runtime redesign/migration is a later user-directed task. Updating tests
to preserve backend integration does not authorize a frontend redesign.

Do not switch production to the native rewrite until the exhaustive feature and
route ledger has no pending/partial ports and behavioral, security, numerical,
restart/recovery and resource-budget validation pass. Candidate services must
never forward to Node or silently claim unsupported features as implemented.
