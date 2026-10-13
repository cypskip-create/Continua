# Index freshness, feed previews and 3D reactions

## Index evidence and boundaries

On 12 October 2026, the [official NSE homepage](https://www.nse.co.ke/)
still displayed `Statistics As of 09-OCT-26`: NASI 244.93, NSE20 4,315.49,
NSE25 6,964.04. Do not change those publisher dates to today's date or
claim these closing observations are a live intraday feed.

The enabled index source was scheduled every 15 minutes, but its last
successful crawl was 11 October 18:30 UTC. Free-instance sleep can pause
in-process cron. Reader catch-up now wakes the collector asynchronously,
deduplicates/throttles requests and honours the existing enabled source,
commercial permission, robots and crawl-revisit limits. This is not an
always-on keep-alive service or a new paid plan. Source collection is
prioritised before slow archives at startup.

Markets' manual refresh now refreshes indices too. Indices and historical
market records refresh every minute while viewed; reconnection/focus also
refreshes indices. The UI labels publisher-dated observations as closing
data. Official validated levels extend the statistics history with their
actual dates, permission reference and source. No gaps are interpolated.
`backend/scripts/diagnoseIndexFreshness.js` is a read-only collector/observation
timestamp diagnostic, not a key or user-data dump.

## Posts

Feed excerpts expose up to 600 Unicode code points, retaining the original
post. Long posts get `Read more`. Text/ending-area taps and keyboard Enter/
Space open the same full post/comments view as the comment button. Rich
ticker links retain their own navigation. The old three-line clamp is gone.

## Reaction artwork

Public reference research included Moomoo's [Emoji Artists Contest](https://www.moomoo.com/community/discussion/623902737)
and [community manual](https://www.moomoo.com/us/manual/topic-14-28). The
artwork is original, not downloaded/copied Moomoo branding or characters.
The built-in image generation tool produced one transparent 26-reaction
sprite atlas at `app/public/reactions/continua-3d-atlas.png` (1374×1145,
approximately 1.5MB). Viewports preserve proportions and share one cached
asset. No runtime paid AI API is enabled. Picker names/tooltips, shark and
diamond are removed; screen-reader labels remain. Old saved shark/diamond
IDs are retained and rendered with neutral replacement artwork, not erased.

Generation prompt (built-in mode):

> Create one production UI reaction sprite atlas for Continua TradersHub.
> Original expressive 3D clay/toy reactions, not Unicode/platform emoji and
> not Moomoo copied characters. Transparent background, no text or labels
> anywhere, no tile backgrounds, no sharks, no diamonds. Precisely 6 equal
> columns by 5 equal rows, each object centered in its own equal cell with
> generous 15% transparent gutters; no objects crossing cell boundaries.
> Wide atlas ideally 6:5 aspect. Soft warm golden faces, glossy resin, soft
> studio specular highlights, lavender-purple accent details. Rounded,
> friendly rich dimensional faces and objects, readable at 32px. Exactly
> in this row-major order: row1 small playful rocket, approving green check
> sculpture, curious face with raised eyebrow, cautious face with exclamation
> accessory, grateful face with small raised hands, sad face with one tear.
> Row2 annoyed face, mint-green rising chart arrow sculpture, coral falling
> chart arrow sculpture, warm glowing flame sculpture, glossy purple/coral
> heart sculpture, sculpted thumbs-up hand. Row3 sculpted thumbs-down hand,
> supportive clasped hands, thoughtful face with lightbulb, curious wide-eyed
> face, laughing face with closed eyes and wide smile, celebrating happy face
> with confetti. Row4 small gold trophy, broken heart sculpture, surprised
> open-mouth face, thinking face hand on chin, shy face covering eyes with
> hands, hopeful face holding hands together. Row5 astonished face with tiny
> spark above head, relaxed smiling face with stylish purple sunglasses,
> remaining four cells completely empty transparent. Consistent scale,
> framing, lighting and materials; cute polished editorial reaction stickers,
> vivid approachable emotion. All 26 subjects must be distinct and centered
> on exact grid. This is one sprite-sheet asset, no surrounding UI, no watermark.

## Verification

Frontend: 86 tests passed. Backend: 354 passed, 6 integration tests skipped.
Scraper: 68 passed. All type checks/builds passed. Local PDF tests needed
the existing Poppler binary on PATH; an unrelated pg ESM/type resolution
issue was fixed using its supported CommonJS export. No migration is needed.
