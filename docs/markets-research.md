# NSE Markets research desk

Stocks, Overview and Kenyan Bonds replace the old discovery tabs. Section arrows open `/markets/:section`. No crypto, options, ETFs, ratings changes or duplicated AI controls. Continua's flat editorial design is retained; charts have animation disabled.

## Data flow and coverage

- `/market-research/intelligence`: Engine computes breadth bins, equal-weight sector movement and dated snapshot monitor signals from published active NSE quotes. These are not block-trade detection or intraday anomaly alerts.
- `/market-research/earnings`: stored reported results and officially stored expected dates / estimates. Missing consensus, EBIT and after-release returns remain unavailable, never inferred from today's move.
- `/market-research/records`: dated, reviewed official IPO, macro, calendar and government-debt observations. Each observation links its primary source.
- `/screener`: existing Engine-computed ratios extended with P/B, ROE, ROA, margins, leverage, payout and evidence dates. Numeric filters exclude missing data; saved screens are explicitly device-local. CSV exports preserve blanks. Compare URLs encode up to four issuers.
- Trend / comparison graphs intersect actual candle dates and normalize the first common close to 100. Return correlation requires nonconstant series. Five-weekday drift is an illustrative log-return scenario, with a historical volatility scale, **not a calibrated forecast confidence interval**. No synthetic history or fallback sparkline.
- Dividend calendar uses announced ex-dates. Calendar files can be imported into the user's calendar. Growth streaks remain unavailable until complete annual distributions are verified.

## Activate official datasets

Apply `supabase/migrations/20261007210000_market_research_records.sql` to the same database as the Data API. No frontend grants or public write route. Then prepare operator-reviewed JSON observations from CBK, KNBS, NSE or CMA source documents; do not treat press rumours as IPO notices.

Run `npm run research:import -- /absolute/path/records.json` from `backend` for validation; add `--reviewed` only after checking source dates, units and figures. This uses configured DATABASE_URL and commits one transaction. Records are not seeded with old auction rates presented as current.

Record contract: `id`, `kind` (`ipo`, `macro`, `economic`, `bond`), `title`, optional `symbol`, ISO `observedAt`, official HTTPS `sourceUrl`, `payload`. Bond payload needs `tenor` in years and `yield` percent; optional coupon and ISO maturity. Macro payload needs `indicator`, `actual`, `unit`, optional previous/consensus. IPO requires status `Available`, `To be Listed`, or `Listed`; optional announced price, offered shares and ISO listing date. Economic calendar needs an officially announced ISO date. Never insert a made-up consensus.

**Deployment boundary:** code deployment does not apply SQL migrations or populate these new datasets. An empty research view is intentional until official observations are loaded. Local environment has no configured production DATABASE_URL, so live activation must happen in the database/hosting environment. No automatic CBK/KNBS document parser or refresh worker is claimed by this change.

## References

Screener filter categories, saved screens and horizontal result tables were informed by [Moomoo's screener documentation](https://www.moomoo.com/us/support/topic3_68), limited to available NSE metrics. Official debt source: [CBK Treasury Bonds](https://www.centralbank.go.ke/bills-bonds/treasury-bonds/). Macro source: [KNBS CPI / inflation](https://www.knbs.or.ke/cpi-and-inflation-rates/).
