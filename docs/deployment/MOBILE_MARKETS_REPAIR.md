# Mobile Markets repair — 16 October 2026

Frontend CSS and existing React/TypeScript remain the appropriate implementation
for viewport containment, sector routing and browser history. No new runtime is
needed. Primary references: [CSS overflow](https://developer.mozilla.org/en-US/docs/Web/CSS/overflow)
and [React Router navigation](https://reactrouter.com/api/hooks/useNavigate).
This is not a frontend redesign or native backend cutover.

- Clip horizontal overflow at the document viewport while retaining scrollable
  market rails and document-owned sticky headers. Previously a 393px viewport
  reported a 534px document width.
- Position each rolling-number wrapper relatively. Its absolute screen-reader
  text otherwise escapes the nested rail's clipping because its containing block
  is the page, contributing offscreen width even when visual digits are clipped.
- Resolve sector display aliases against the current instrument directory; use
  API-provided member symbols for groups absent from that directory. Do not
  declare a sector missing while its directory is loading.
- Pop known plans-to-checkout history; replace direct checkout entries and use
  an account fallback instead of adding another checkout/plans history loop.
- Repair the existing production JavaScript index collector in place: invalidate
  the published-index cache after ingestion and extract retained HTML artifacts
  whose index extraction is missing. No TypeScript backend code was added.
- The lightweight collector retains its four-request / 512KiB per-response
  limits. A failed six-hour SQL slot gets at most one recovery after 20 minutes;
  completed/running slots cannot be reclaimed. These are logical traffic bounds,
  not a Render invoice spending cap. Bulk collection remains in Actions.

Only dated publisher observations are published. The official NSE homepage
returned NASI, NSE20 and NSE25 dated 15 October during investigation; it did not
provide a new NSE10 observation. Never relabel older NSE10 data as current or
invent intraday index prices.
