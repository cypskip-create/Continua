# Engine and stock research presentation

This presentation update retains canonical financial APIs, numerical models,
entitlements and the application's bottom navigation. It uses the existing React
runtime, JSX for new components, and scoped CSS; no additional service is needed.

Engine Company views use a compact company heading, source-labelled annual
highlights, collapsible coverage, horizontal research controls and dated news.
Earnings views separate latest releases, historical observations, statements and
ratios. Stock Focus and all shared full-screen detailed research views use the
same flat headings, tab rails, tables and spacing. Missing currency, filing dates,
estimates and images remain unavailable; the reference image is not a data source.

Home indices can be swiped manually. Quick Watch scrolls automatically, pauses
on interaction or its explicit control, and respects reduced-motion preferences.
Lower Home sections retain their existing behavior.

## Index collection

Index reads may request the existing bounded render-light collection even when
bulk collection runs in GitHub Actions. The existing durable six-hour collector
slots, source permissions, deduplication and timeouts remain in force. Collection
does not create a live exchange feed, and UI refreshes do not alter source dates.

On October 20, a successful one-page collection archived the official NSE summary
in R2. Its published NASI/NSE20/NSE25 observations still carried October 16 dates;
NSE10 was absent from that snapshot. Preserve the last available NSE10 observation
and its older date. Do not overwrite these dates with retrieval time or synthesize
new index levels. Source enablement and permission references are checked again
when reading archive candidates.
