/**
 * Runs the ACTUAL ingestion pipeline (mock NSE adapter → normalize →
 * validate → Postgres) end-to-end against a real database, then checks the
 * results through the real repositories/services AND the API-facing
 * screener query — the same things that were verified by hand with curl
 * during development, now codified so they don't silently regress.
 *
 * Requires DATABASE_URL to point at a real Postgres with
 * supabase/migrations/030_market_schema.sql and 031_production_readiness.sql
 * already applied. Skips itself (not a failure) when DATABASE_URL isn't set,
 * so `npm test` stays runnable with zero setup for anyone just checking
 * pure-function correctness.
 *
 * The full bootstrap runs ONCE in beforeAll (it's expensive — real DB
 * writes for 17 securities across 4 pipelines) and every `it()` below
 * asserts against that same seeded state.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

d("pipeline integration (requires DATABASE_URL)", () => {
  let pool: import("pg").Pool;
  let symbols: string[] = [];

  beforeAll(async () => {
    const { pool: p } = await import("../../src/storage/db.js");
    pool = p;
    await pool.query(`
      TRUNCATE market.ingestion_logs, market.dead_letters, market.corporate_actions,
        market.earnings_events, market.ownership, market.live_quotes, market.candles,
        market.computed_ratios, market.afri_scores, market.cash_flow_statements,
        market.balance_sheets, market.income_statements, market.financial_periods,
        market.securities, market.companies, market.sectors
      RESTART IDENTITY CASCADE
    `);

    const { NseAdapter } = await import("../../src/adapters/nse/nseAdapter.js");
    const { MockNseClient } = await import("../../src/adapters/nse/nseClient.js");
    const { runFundamentalsIngestion } = await import("../../src/ingestion/pipelines/fundamentalsIngestionPipeline.js");
    const { runCorporateActionsIngestion } = await import("../../src/ingestion/pipelines/corporateActionsIngestionPipeline.js");
    const { ingestDailyCandles } = await import("../../src/ingestion/pipelines/candlesIngestionPipeline.js");
    const { runPriceIngestion } = await import("../../src/ingestion/pipelines/priceIngestionPipeline.js");
    const { researchService } = await import("../../src/services/research/researchService.js");

    const adapter = new NseAdapter(new MockNseClient());
    const allSecurities = await adapter.listSecurities();
    symbols = allSecurities.map((s) => s.symbol);

    await runFundamentalsIngestion(adapter, symbols);
    await runCorporateActionsIngestion(adapter, new Date(Date.now() - 7 * 86_400_000).toISOString(), symbols);
    await ingestDailyCandles(adapter, symbols, 100);
    await runPriceIngestion(adapter, symbols);
    await researchService.recomputeAllForExchange("NSE");
  }, 30_000);

  afterAll(async () => {
    await pool.end();
  });

  it("bootstraps the whole universe with zero hard ingestion failures", async () => {
    const { ingestionLogRepository } = await import("../../src/storage/repositories/ingestionLogRepository.js");
    expect(symbols.length).toBeGreaterThan(10); // sanity: the mock seed list is non-trivial
    const logs = await ingestionLogRepository.recent(50);
    expect(logs.filter((l) => l.status === "failed")).toEqual([]);
  });

  it("computes research for every symbol, not just whichever gets queried first", async () => {
    const { researchService } = await import("../../src/services/research/researchService.js");
    const { securitiesRepository } = await import("../../src/storage/repositories/securitiesRepository.js");
    for (const symbol of symbols) {
      const security = await securitiesRepository.getBySymbol("NSE", symbol);
      const score = await researchService.getAfriScore(security!.id);
      expect(score, `${symbol} should have an AfriScore`).not.toBeNull();
    }
  });

  it("produces plausible, correctly-scaled ratios for a spot-checked symbol", async () => {
    const { researchService } = await import("../../src/services/research/researchService.js");
    const { securitiesRepository } = await import("../../src/storage/repositories/securitiesRepository.js");
    const safcom = await securitiesRepository.getBySymbol("NSE", "SCOM");
    const ratios = await researchService.getRatios(safcom!.id);
    // Regression guard for the numeric-as-string bug: if pg ever stops
    // parsing NUMERIC columns as real numbers, this comparison silently
    // does the wrong thing instead of throwing, so assert the JS type too.
    expect(typeof ratios?.pe).toBe("number");
    expect(ratios?.pe).toBeGreaterThan(0);
    expect(ratios?.pe).toBeLessThan(100); // catches the market-cap/EPS scale bug that was fixed
  });

  it("populates and correctly links sectors — companies aren't left sectorless", async () => {
    const res = await pool.query<{ sector: string | null }>(
      `SELECT c.name as sector FROM market.securities s
       JOIN market.companies co ON co.id = s.company_id
       LEFT JOIN market.sectors c ON c.id = co.sector_id
       WHERE s.exchange = 'NSE'`
    );
    expect(res.rows.length).toBeGreaterThan(0);
    expect(res.rows.every((r) => r.sector !== null)).toBe(true);
  });

  it("screener filters by sector correctly (regression: sectors.sector_id doesn't exist, must join on sectors.id)", async () => {
    const { screeningService } = await import("../../src/services/screening/screeningService.js");
    const bankingRows = await screeningService.screen({ exchange: "NSE", sector: "banking", limit: 50 });
    expect(bankingRows.length).toBeGreaterThan(0);
    expect(bankingRows.every((r: any) => r.sector === "Banking")).toBe(true);

    const allRows = await screeningService.screen({ exchange: "NSE", limit: 50 });
    expect(bankingRows.length).toBeLessThan(allRows.length); // the filter actually narrowed results
  });

  it("aggregates monthly candles by calendar month, not fixed 30-day windows", async () => {
    const { candlesRepository } = await import("../../src/storage/repositories/candlesRepository.js");
    const { securitiesRepository } = await import("../../src/storage/repositories/securitiesRepository.js");
    const safcom = await securitiesRepository.getBySymbol("NSE", "SCOM");
    const to = new Date().toISOString();
    const from = new Date(Date.now() - 100 * 86_400_000).toISOString();
    const monthly = await candlesRepository.getCandles(safcom!.id, "1M", from, to);
    for (const bar of monthly) {
      // Every monthly bar's timestamp should land on the 1st of its month.
      expect(new Date(bar.timestamp).getUTCDate()).toBe(1);
    }
  });
});