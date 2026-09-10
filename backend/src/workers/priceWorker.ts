/**
 * Keeps live_quotes fresh during market hours. Pull-based on a fixed
 * interval today (PRICE_POLL_INTERVAL_MS) — every tick runs the full
 * ingestion pipeline (normalize → validate → store → cache → broadcast →
 * audit-log) for every active symbol on every registered exchange, but
 * ONLY while that exchange's market is actually open (see
 * config/tradingCalendar.ts) — no point polling a closed market, and in
 * mock mode it avoids generating unrealistic overnight/weekend "trades".
 *
 * When a real licensed feed with a push/streaming endpoint is wired into
 * an adapter's `subscribeQuotes`, this can switch from setInterval to an
 * event-driven subscription without touching the pipeline itself — see the
 * commented alternative below.
 */
import { getAllAdapters } from "../adapters/registry.js";
import { securitiesRepository } from "../storage/repositories/securitiesRepository.js";
import { runPriceIngestion } from "../ingestion/pipelines/priceIngestionPipeline.js";
import { isMarketOpen } from "../config/tradingCalendar.js";
import { env } from "../config/index.js";
import { logger } from "../monitoring/logger.js";
import type { IExchangeAdapter } from "../adapters/types.js";

/** For adapters that can enumerate their own listing independent of
 *  financials (see IExchangeAdapter.listSecuritiesWithCompanies), create a
 *  bare-bones market.securities row for anything the adapter knows about
 *  that isn't in the database yet — otherwise a symbol with no financials
 *  feed (like everything MyStocksClient covers beyond the original
 *  fundamentals-seeded set) would NEVER get a row to attach a price to,
 *  regardless of how well its price data source works.
 *
 * Deliberately additive-only: every symbol is checked against the
 * database first and skipped if it already exists, so this can never
 * clobber a real company name/sector the fundamentals pipeline already
 * populated with this adapter's placeholder (symbol-as-name, "Unknown"
 * sector) version. */
async function ensureListingsSeeded(adapter: IExchangeAdapter): Promise<void> {
  if (!adapter.listSecuritiesWithCompanies) return;
  let entries: Awaited<ReturnType<NonNullable<IExchangeAdapter["listSecuritiesWithCompanies"]>>>;
  try {
    entries = await adapter.listSecuritiesWithCompanies();
  } catch (err) {
    logger.warn({ exchange: adapter.exchange, err }, "Failed to enumerate listings for seeding — skipping this pass");
    return;
  }
  for (const { security, company, sector } of entries) {
    const existing = await securitiesRepository.getBySymbol(adapter.exchange, security.symbol).catch(() => null);
    if (existing) continue;
    try {
      // Reuse an existing sector row by NAME if one already exists (see
      // getSectorByName's doc comment) — only create a new sector row
      // when the name is genuinely not present yet.
      const existingSector = await securitiesRepository.getSectorByName(sector.name);
      const resolvedSectorId = existingSector?.id ?? sector.id;
      if (!existingSector) await securitiesRepository.upsertSector(sector);
      await securitiesRepository.upsertCompany({ ...company, sectorId: resolvedSectorId });
      await securitiesRepository.upsertSecurity(security);
      logger.info({ exchange: adapter.exchange, symbol: security.symbol }, "Seeded bare-bones security listing (no fundamentals yet)");
    } catch (err) {
      logger.warn({ exchange: adapter.exchange, symbol: security.symbol, err }, "Failed to seed security listing");
    }
  }
}

let intervalHandle: NodeJS.Timeout | null = null;

export interface RunOnceOptions {
  /** Bootstrap's one-time seed pass sets this false — it needs at least one
   *  quote to exist (for research to compute against) regardless of
   *  whether the market happens to be open at deploy time. The recurring
   *  interval leaves this true. */
  respectTradingCalendar?: boolean;
}

/** One full pass over every active symbol on every registered exchange.
 *  Exported separately from the interval loop so bootstrap can run it
 *  synchronously once (to populate live_quotes before anything downstream
 *  — like a first research computation — needs a price to work with). */
export async function runPriceIngestionOnce(options: RunOnceOptions = {}): Promise<void> {
  const { respectTradingCalendar = true } = options;
  for (const adapter of getAllAdapters()) {
    try {
      if (respectTradingCalendar && !isMarketOpen(adapter.exchange)) {
        logger.debug({ exchange: adapter.exchange }, "Market closed — skipping price ingestion tick");
        continue;
      }
      await ensureListingsSeeded(adapter);
      const securities = await securitiesRepository.listByExchange(adapter.exchange);
      if (securities.length === 0) continue; // not bootstrapped yet
      await runPriceIngestion(adapter, securities.map((s) => s.symbol));
    } catch (err) {
      logger.error({ err, exchange: adapter.exchange }, "Price ingestion pass failed");
    }
  }
}

export function startPriceWorker(): () => void {
  const adapters = getAllAdapters();
  logger.info({ exchanges: adapters.map((a) => a.exchange), intervalMs: env.PRICE_POLL_INTERVAL_MS }, "Starting price worker");
  for (const adapter of adapters) {
    logger.info(
      { exchange: adapter.exchange, hasListingSeeding: typeof adapter.listSecuritiesWithCompanies === "function" },
      "Adapter listing-seeding capability"
    );
  }

  intervalHandle = setInterval(() => { void runPriceIngestionOnce(); }, env.PRICE_POLL_INTERVAL_MS);

  return () => {
    if (intervalHandle) clearInterval(intervalHandle);
  };

  // ── Push-based alternative (once a real feed supports streaming) ──────
  // const unsubs = adapters.map((adapter) =>
  //   adapter.subscribeQuotes([], (quote) => {
  //     // still route through normalize/validate/store, just per-tick
  //     // instead of per-poll — see priceIngestionPipeline for the pieces.
  //   })
  // );
  // return () => unsubs.forEach((fn) => fn());
}

// Allows `npm run worker:price` to run this worker standalone.
if (import.meta.url === `file://${process.argv[1]}`) {
  startPriceWorker();
}