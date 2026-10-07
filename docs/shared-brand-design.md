# Continua website and app identity

The public site and authenticated product share React, Inter and the design
tokens in `app/src/styles/brand-system.css`. The site remains an editorial,
animated introduction; product screens stay compact, static and canvas-first.

## Brand artwork

All website marks (header, hero, portfolio demo and footer) use `ContinuaMark`
with the actual `app/public/brand/logo-light.png` asset. A fixed light appearance
matches the white site even when the visitor saved a dark app theme. The app
continues to choose light/dark and seasonal artwork through `useActiveLogo`.
No original logo or PWA icon is replaced or deleted.

## Product treatment

- Pure white light canvas, ink text, soft lavender actions and violet links.
- Dark and true-black AMOLED versions keep readable labels and selected states.
- Medium-weight Inter headings, quiet eyebrows, hairlines and pill controls.
- All authenticated routes inherit the flat `page-canvas` treatment. Cards,
  grouped sections and upgrade banners are embedded in the canvas, not tiles.
- Dialogs, sheets, charts, imagery and real input controls keep their necessary
  boundaries. Navigation destinations, scroll restoration and font-size
  preferences are unchanged.
- No website orbits, parallax, reveal animations or floating demo content are
  introduced into the app. Decorative login glows/tickers were removed. Existing
  functional loading, refresh and panel transitions remain.
- Market gains/losses and chart series retain their independent semantic colours;
  pale action fills are not used for warning chart strokes or small accent text.

## Verification

Production build, TypeScript and app unit tests pass. Local Playwright suites
check four responsive website widths, real logo delivery, fixed light artwork,
light/dark/AMOLED text contrast (at least 4.5:1), card-free surfaces, font scaling,
navigation, login, news, composer, portfolio, Fundamentals and Engine interactions.
Browser data is fixture-only; these checks do not mutate production accounts.
