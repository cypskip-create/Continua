/**
 * Fundamentals move slowly (quarterly/annual filings), so this pipeline is
 * driven by a daily cron (financialsWorker.ts), not a poll loop. After
 * storing, it recomputes ratios + AfriScore for each symbol so research
 * pages are never showing stale scores against fresh financials.
 */
import type { IExchangeAdapter } from "../../adapters/types.js";
import { fundamentalsCollector } from "../collectors/fundamentalsCollector.js";
import { normalizeCompany, normalizeSecurity } from "../../normalization/companies/normalizeCompany.js";
import { normalizeIncomeStatement, normalizeCashFlow, checkBalanceSheetIntegrity } from "../../normalization/financials/normalizeFinancials.js";
import { securitiesRepository } from "../../storage/repositories/securitiesRepository.js";
import { financialsRepository } from "../../storage/repositories/financialsRepository.js";
import { pricesRepository } from "../../storage/repositories/pricesRepository.js";
import { ingestionLogRepository } from "../../storage/repositories/ingestionLogRepository.js";
import { deadLetterRepository } from "../../storage/repositories/deadLetterRepository.js";
import { researchService } from "../../services/research/researchService.js";
import { cache, CacheKeys } from "../../storage/cache.js";
import { logger } from "../../monitoring/logger.js";

export async function runFundamentalsIngestion(adapter: IExchangeAdapter, symbols: string[]): Promise<void> {
  const startedAt = new Date().toISOString();
  const errors: string[] = [];
  let stored = 0;

  const { bundles, failures } = await fundamentalsCollector.collectForSymbols(adapter, symbols);

  // Symbols that failed collection even after retries — dead-lettered so
  // a persistently-broken symbol is visible, not just quietly absent from
  // the screener until someone notices.
  for (const failure of failures) {
    errors.push(`${failure.symbol}: collection failed — ${failure.error}`);
    await deadLetterRepository.record({
      exchange: adapter.exchange, dataset: "financials", symbol: failure.symbol,
      payload: { symbol: failure.symbol }, error: failure.error,
    });
  }

  for (const bundle of bundles) {
    try {
      const security = normalizeSecurity(bundle.security);
      const company = normalizeCompany(bundle.company);
      const income = normalizeIncomeStatement(bundle.income);
      const cashFlow = normalizeCashFlow(bundle.cashFlow);

      const balanceCheck = checkBalanceSheetIntegrity(bundle.balance);
      if (!balanceCheck.ok) {
        errors.push(`${security.symbol}: balance sheet off by ${balanceCheck.deltaPercent}%`);
        logger.warn({ symbol: security.symbol, deltaPercent: balanceCheck.deltaPercent }, "Balance sheet integrity check failed — stored anyway, flagged for review");
      }

      // FK chain: sector must exist before company (company.sector_id
      // references it), and company before security — same lesson as the
      // earlier company/security ordering bug, one link further up the chain.
      await securitiesRepository.upsertSector(bundle.sector);
      await securitiesRepository.upsertCompany(company);
      await securitiesRepository.upsertSecurity(security);
      await financialsRepository.upsertPeriodBundle(bundle.period, income, bundle.balance, cashFlow);
      stored++;

      // Fundamentals just changed — the cached ratios/AfriScore for this
      // symbol are now stale, so recompute and re-cache immediately rather
      // than waiting for the next request to trigger it.
      const quote = await pricesRepository.getQuote(security.id);
      if (quote) {
        await researchService.recomputeAndStore(security.id, quote.lastPrice);
        await cache.del(CacheKeys.ratios(security.exchange, security.symbol));
        await cache.del(CacheKeys.afriScore(security.exchange, security.symbol));
      }
    } catch (err) {
      errors.push(`${bundle.security.symbol}: ${String(err)}`);
      await deadLetterRepository.record({
        exchange: adapter.exchange, dataset: "financials", symbol: bundle.security.symbol,
        payload: bundle, error: String(err),
      });
    }
  }

  await ingestionLogRepository.log({
    exchange: adapter.exchange, dataset: "financials",
    status: errors.length === 0 ? "success" : (stored > 0 ? "partial" : "failed"),
    recordCount: stored, errorCount: errors.length,
    startedAt, finishedAt: new Date().toISOString(),
    errors: errors.length ? errors.slice(0, 20) : undefined,
  });
}
