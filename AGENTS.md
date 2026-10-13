# Continua implementation preferences

Before implementing a requested feature or migration, research suitable languages
using current primary documentation. Assess the feature's workload, numerical
requirements, supported libraries, deployment limits, security, integration and
maintenance costs. State and record the selected language and concrete rationale.
Do not force TypeScript or add another runtime simply for variety.

For backend, Engine and scraper implementations, the user requested replacing
TypeScript. Runtime source is plain JavaScript/Node or Deno, with isolated Python
workers where justified. Existing non-executable `.d.ts` contracts and development
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
