# Issuer evidence and landing rebuild

## News relevance

The previous reader called unverified, stored ticker associations “Affected stocks”. That conflated page mentions with price impact and retained old bad associations.

Issuer evidence v2 lives in `backend/src/services/research/newsRelevance.ts` and is shared by ingestion, response validation, and historical repair. It checks issuer names, narrow brand aliases, explicit tickers, and the first substantive article prose. Quote rails, page menus, recommendations and unrelated boilerplate are not evidence. A company that is not in the exchange directory is not assigned to an unrelated listed peer. Legacy Safaricom symbols are collapsed when SCOM exists.

Every news API response revalidates associations from the stored extraction, not the old join table. Stock and portfolio queries filter that verified set; the reader shows a source quote for each relationship and explicitly distinguishes relevance from a proven price effect. Legacy cached unverified reader chips are withheld. Broad macro stories remain unassigned rather than making speculative company claims. This is conservative calculated analysis, not an LLM or guaranteed inference of every indirect economic effect.

The scheduled news bridge repairs 100 historical receipts per pass, advances an in-memory cursor and starts over after reaching the end. It does not delete stories or modify publication dates. For immediate complete repair, run `npm run news:revalidate` on the backend host with its existing database environment. An unavailable issuer directory prevents destructive repair. No schema migration is required. These changes require backend and scraper deployment to affect the live app.

## Landing

The old landing implementation has been replaced with a scoped React/Framer Motion page. Public reference: https://verve.com (inspected 7 October 2026). Its observed public assets are a custom WordPress theme with jQuery and React; we adapted the spacious editorial layout, rounded controls, airy violet palette, grouped product storytelling and reveal/parallax patterns into Continua's existing React stack, rather than switching the app to WordPress or copying Verve's assets.

The page covers Portfolio, Fundamentals, TradersHub, Engine, Markets, watchlists, screening, comparisons, charts, technicals, news, alerts, calendars, learning, personalization and Free/Premium boundaries. Sample financial values, polls and community posts are labeled illustrative. There are no invented testimonials or promised returns. Forecast availability and private proprietary ratings are described honestly.

The portfolio film is a code-native animated SVG and changing value display, not a remote autoplay video. It includes rises and falls, starts/stops with viewport visibility, offers pause/resume, and honors reduced motion. Tabs support arrow/Home/End keyboard navigation; the expandable mobile menu closes on selection/Escape; FAQs are native details controls. Decorative animation and hover effects also honor reduced motion. Styles are isolated under `.continua-landing` to avoid changing authenticated app pages.

### Original generated asset

Asset: `app/public/landing/engine-core.png`. Generated using the built-in image-generation tool, inspected and copied into the repository. Prompt: “Premium editorial 3D macro image of a transparent optical intelligence core, translucent glass arcs and precision brushed-metal rings, faint violet and electric cobalt light paths, white studio background, soft realistic shadows, landscape composition. No text, logos, watermark, financial numbers, bull or turbine.” The image-generation skill informed this original asset; product UI and charts remain accessible real HTML/SVG.

Verification: backend issuer/legacy repair regressions, scraper extraction tests, app typecheck/production build, and isolated browser checks for 320/390/768/1440 widths, tabs, keyboard, menu, FAQs, anchors, image loading, pause and reduced motion. Screenshots are in ignored `.qa-artifacts/landing-*.png`.
