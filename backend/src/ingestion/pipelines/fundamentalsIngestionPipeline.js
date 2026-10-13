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
export async function runFundamentalsIngestion(adapter, symbols) {
    const startedAt = new Date().toISOString();
    const errors = [];
    let stored = 0;
    const changedSecurities = new Map();
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
            const today = new Date().toISOString().slice(0, 10);
            if (bundle.period.periodEnd.slice(0, 10) > today || bundle.period.reportedAt.slice(0, 10) > today || bundle.period.reportedAt.slice(0, 10) < bundle.period.periodEnd.slice(0, 10)) {
                throw new Error('Financial filing dates are future-dated or precede the reporting period');
            }
            const balanceCheck = checkBalanceSheetIntegrity(bundle.balance);
            if (!balanceCheck.ok) {
                errors.push(`${security.symbol}: balance sheet off by ${balanceCheck.deltaPercent}%`);
                throw new Error('Balance sheet integrity check failed; retained in review, not published');
            }
            // FK chain: sector must exist before company (company.sector_id
            // references it), and company before security — same lesson as the
            // earlier company/security ordering bug, one link further up the chain.
            await securitiesRepository.upsertSector(bundle.sector);
            await securitiesRepository.upsertCompany(company);
            await securitiesRepository.upsertSecurity(security);
            await financialsRepository.upsertPeriodBundle(bundle.period, income, bundle.balance, cashFlow);
            stored++;
            changedSecurities.set(security.id, security);
        }
        catch (err) {
            errors.push(`${bundle.security.symbol}: ${String(err)}`);
            await deadLetterRepository.record({
                exchange: adapter.exchange, dataset: "financials", symbol: bundle.security.symbol,
                payload: bundle, error: String(err),
            });
        }
    }
    // Recompute once per security after all historical periods have been saved.
    // Recomputing after each old period wastes work and temporarily exposes
    // incomplete history to the research cache.
    for (const security of changedSecurities.values()) {
        try {
            const quote = await pricesRepository.getQuote(security.id);
            if (quote)
                await researchService.recomputeAndStore(security.id, quote.lastPrice);
            await cache.del(CacheKeys.ratios(security.exchange, security.symbol));
            await cache.del(CacheKeys.afriScore(security.exchange, security.symbol));
        }
        catch (err) {
            errors.push(`${security.symbol}: research recompute failed: ${String(err)}`);
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
