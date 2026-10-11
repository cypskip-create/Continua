# Website resources and archive discovery — 11 October 2026

## Product decisions

Reviewed Moomoo's public help centre, company page and developer portal. Useful public-site patterns are product guides, support, company background, developer reference and clear risk/coverage disclosures. Continua now has `/docs`, `/developers`, `/about`, `/help` and `/trust`, with landing navigation and resource cards. These pages describe actual Continua workflows rather than claiming broker execution, custody, external AI services or an open API programme.

Research references: [Moomoo help](https://www.moomoo.com/us/support), [company information](https://www.moomoo.com/us/about), [developer reference](https://open.moomoo.com/api/overview/api-reference). Some full-page fetches were denied or timed out; the published search listings and available developer reference guided the resource categories, not copied text.

The downloadable OpenAPI 3.1 preview documents a subset of implemented read routes. External onboarding, quotas and data redistribution rights still need agreement; Premium app access does not issue an API key. Authentication and query parameters were checked against backend routes and validators. No credentials or production keys are in examples.

Removed obsolete afrifinance.lovable.app URLs from robots and sitemap. The public sitemap uses the stable Vercel alias until a custom domain is connected. Account-only and nonexistent news routes are not advertised in the sitemap.

## Artwork

Hero: existing brand artwork, reduced and contained within the central circular frame, without a tilted oversized tile.

Engine: generated with the built-in image generator, not the API CLI; asset `app/public/landing/engine-research.png`. Original generation stays in the Codex generated-images directory. Prompt: a restrained editorial 3D evidence-led workspace, matte company reports, lavender magnifying lens, tabbed financial history and connected charts, warm off-white background, no words, logos, people, watermarks, diamonds, crystal spheres or metallic orbital rings. Conceptual illustration, not actual market data. Inspected the generated asset and its rendered website placement.

## Archive discovery, not automatic publication

Verified the [NSE homepage](https://www.nse.co.ke/), [company-announcement archive](https://www.nse.co.ke/listed-company-announcements/), [corporate actions](https://www.nse.co.ke/corporate-actions/), [press releases](https://www.nse.co.ke/press-releases/) and [events](https://www.nse.co.ke/nse-events/). The homepage Corporate Announcements View All resolves to the listed-company archive; its live year controls expose 2015 onward. Corporate Actions View All is a separate category. Success-story PDFs on the homepage remain discoverable as publisher documents, not automatically financial statements.

Discovery follows live official category links (including View All), reads publisher-provided form configuration and visits real year/page controls. It remains bounded to 40 archive URLs and 80 AJAX pages per run, respects robots and configured request rates, preserves year/page/category provenance and durably queues documents before marking a page complete. A failed year now retains its retryable checkpoint and no longer prevents later years from being checked. Checkpoints resume subsequent runs; a bounded crawl is not proof of a fully populated archive.

No database schema change is required. Downloaded documents still require extraction and validation before financial publication. Unsupported layouts, missing historical periods and nonfinancial announcements are not converted into fabricated charts. Expansion of extraction mappings and publication is the next task requested by the user.

## Live discovery result

Bounded discovery found 636 unique document URLs on the first run. Inspection revealed an empty-fragment (`/#`) duplicate of the main archive consuming the crawl budget. Canonicalization now strips fragments and unifies directory slash variants, while preserving year query strings; the follow-up run visited seven canonical category pages, reused completed checkpoints and found 25 direct document URLs without spending its AJAX-page budget. Legacy duplicate checkpoint rows are preserved, not destructively removed, but are no longer visited.

Canonical checkpoints now show 140/140 discovered company-announcement pages and 20/20 press-release pages completed across 2015–2026. This means discovery and durable enqueueing—not complete extraction or financial publication. At the 17:51 EAT observation, NSE document jobs were 981 pending, 55 processing, 119 complete and 1 failed. The next ingestion task must address the outstanding work and validate source/layout coverage; do not describe the entire archive as published.

## Verification

App TypeScript and production build; 76 app tests; scraper regression suite plus focused category/canonicalization cases. Local browser smoke covers landing interactions, reduced motion, image decoding and all five resource routes at 320, 390, 768 and 1440 pixels, downloadable OpenAPI and valid anchors, with production requests blocked. Screenshots are under ignored `.qa-artifacts/`.
