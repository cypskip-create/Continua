import { buildResearchSynthesis } from "./engineSynthesis.js";
import { summarizeNews } from "./newsDigest.js";
import { newsRepository } from "../../storage/repositories/newsRepository.js";
import { indicatorsService } from "../technical/indicatorsService.js";
import { securitiesRepository } from "../../storage/repositories/securitiesRepository.js";
import { pricesRepository } from "../../storage/repositories/pricesRepository.js";
import { financialsRepository } from "../../storage/repositories/financialsRepository.js";
import { corporateActionsRepository } from "../../storage/repositories/corporateActionsRepository.js";
import { valuationService } from "../../services/technical/valuationService.js";
import { buildCompanyBriefing } from "./engineBriefing.js";
import { cache } from "../../storage/cache.js";
import { ApiError } from "../../api/middleware/errorHandler.js";
import { logger } from '../../monitoring/logger.js';
import { analyzeFinancials, dataQuality, scenarios, } from "./engineAnalytics.js";
import { engineRepository } from "../../storage/repositories/engineRepository.js";
import { trailingDividendPerShare } from "./dividendMetrics.js";
import { companyDiagnostics } from './companyDiagnostics.js';
import { researchReadiness } from './researchReadiness.js';
import { reportedResearchRatios, reportedResearchRows } from './reportedResearch.js';
import { computeAfriScore } from './afriScore.js';
import { yoyGrowth } from './ratiosEngine.js';
import { engineCacheKeys } from './engineCacheKeys.js';
import { collectedResearchRepository } from './collectedResearch.js';
const pendingBundles = new Map();
export async function getEngineBundle(symbol, exchange) {
    const key = `${exchange}:${symbol}`;
    const staleKey = engineCacheKeys.lastGood(exchange, symbol);
    const cached = await cache.get(staleKey);
    const age = cached ? Date.now() - Date.parse(cached.generatedAt) : Infinity;
    if (cached && age >= 0 && age < 60_000)
        return cached;
    let job = pendingBundles.get(key);
    if (!job) {
        job = loadEngineBundle(symbol, exchange).then(async (bundle) => {
            const retainedAge = cached ? Date.now() - Date.parse(cached.generatedAt) : Infinity;
            if (cached && retainedAge >= 0 && retainedAge < 24 * 60 * 60_000 && bundle.unavailable.some(section => ['Quote', 'Financial statements'].includes(section))) {
                const retained = { ...cached, refresh: { state: 'retained', failedSections: bundle.unavailable, attemptedAt: bundle.generatedAt } };
                await cache.set(staleKey, retained, Math.max(1, 24 * 60 * 60_000 - retainedAge));
                return retained;
            }
            await cache.set(staleKey, bundle, 24 * 60 * 60_000);
            return bundle;
        }).finally(() => pendingBundles.delete(key));
        pendingBundles.set(key, job);
    }
    // Keep the original generatedAt so older data is never labelled as live.
    // Refresh in the background; failed refreshes cannot erase last good data.
    if (cached && age >= 0 && age < 24 * 60 * 60_000) {
        void job.catch(error => logger.warn({ error, key }, 'Engine background refresh failed; retaining dated research'));
        return cached;
    }
    return job;
}
async function loadEngineBundle(symbol, exchange) {
    return cache.getOrSet(engineCacheKeys.bundle(exchange, symbol), 60_000, async () => {
        const profile = await securitiesRepository.getCompanyProfile(exchange, symbol);
        if (!profile)
            throw new ApiError(404, "This stock is not covered yet");
        const unavailable = [];
        const optional = async (name, request, fallback) => {
            let timer;
            try {
                return await Promise.race([
                    request,
                    new Promise((_, reject) => {
                        timer = setTimeout(() => reject(new Error("Research deadline")), /statements/i.test(name) ? 15_000 : 6_000);
                    }),
                ]);
            }
            catch {
                unavailable.push(name);
                return fallback;
            }
            finally {
                if (timer)
                    clearTimeout(timer);
            }
        };
        const [quote, history, earnings, ownership, valuation, news, technicals, actions, quarterly, publisherResearch] = await Promise.all([
            optional("Quote", pricesRepository.getQuote(profile.id), null),
            optional("Financial statements", financialsRepository.getHistoricalPeriods(profile.id, "annual", 10), []),
            optional("Earnings", corporateActionsRepository.getEarningsBySecurity(profile.id), []),
            optional("Ownership", corporateActionsRepository.getOwnership(profile.id), []),
            optional("Valuation", valuationService.compute(exchange, symbol), null),
            optional("News", newsRepository.listBySecurity(profile.id, 12), []),
            optional("Technicals", Promise.all(["SMA", "RSI", "MACD"].map((type) => indicatorsService.compute({
                exchange,
                symbol,
                type,
                from: new Date(Date.now() - 400 * 86400000)
                    .toISOString()
                    .slice(0, 10),
                to: new Date().toISOString().slice(0, 10),
            }))), []),
            optional("Corporate actions", corporateActionsRepository.getBySecurity(profile.id), []),
            optional("Quarterly statements", financialsRepository.getHistoricalPeriods(profile.id, "quarterly", 12), []),
            exchange === 'NSE' ? optional('Collected research', collectedResearchRepository.get(symbol), []) : [],
        ]);
        const digest = await Promise.all(news
            .filter((item) => !item.needsReview)
            .slice(0, 6)
            .map(async (item) => {
            const article = await optional("Article text", newsRepository.getById(item.id), null);
            return {
                id: item.id,
                headline: item.headline,
                ...summarizeNews(item.headline, article?.content, item.excerpt),
                source: item.sourceName,
                url: item.articleUrl,
                publishedAt: item.publishedAt,
                impact: item.impact,
            };
        }));
        const sorted = [...history].sort((a, b) => a.fiscalYear - b.fiscalYear);
        const latest = sorted.at(-1), prior = sorted.at(-2);
        // Derive headline metrics from this bundle's dated, reviewed inputs,
        // never a previously cached ratio whose filing/quote basis is unknown.
        const ratios = reportedResearchRatios(profile.id, quote, sorted, quote ? trailingDividendPerShare(actions, new Date(quote.timestamp)) ?? null : null);
        const scoringHistory=reportedResearchRows(quote,sorted);
        const latestScore=scoringHistory.at(-1),priorScore=scoringHistory.at(-2);
        const adjacent = latestScore && priorScore && latestScore.fiscalYear === priorScore.fiscalYear + 1 && (!latestScore.currency || !priorScore.currency || latestScore.currency===priorScore.currency);
        const score = ratios ? { ...await computeAfriScore(profile.id, { ratios,
            sector: profile.company.sectorName, basis: latestScore?.basis ?? 'reviewed_filing', fiscalYear: latestScore?.fiscalYear,
            filingDateKnown: Boolean(latestScore?.reportedAt), sourceUrls: latestScore?.sourceUrls ?? [], calculatedAt: new Date().toISOString(),
            revenueGrowthYoy: adjacent ? yoyGrowth(latestScore.revenue, priorScore.revenue) : undefined, epsGrowthYoy: adjacent ? yoyGrowth(latestScore.eps, priorScore.eps) : undefined }), asOf: quote.timestamp } : null;
        const financialAnalysis = analyzeFinancials(sorted, profile.company.sectorName ?? "");
        const quality = dataQuality(quote, sorted);
        const state = {
            fiscalYear: latest?.fiscalYear ?? null,
            revenue: latest?.revenue ?? null,
            netIncome: latest?.netIncome ?? null,
            debtToEquity: financialAnalysis.metrics.debtToEquity,
            fairValue: valuation?.models.find((m) => m.fairValue != null)?.fairValue ?? null,
            newsIds: digest.map((n) => n.id).sort(),
            ownership: ownership
                .map((h) => ({ name: h.holderName, percent: h.percentHeld }))
                .sort((a, b) => a.name.localeCompare(b.name)),
        };
        const changes = unavailable.length === 0
            ? await optional("Change history", engineRepository.observe(profile.id, state), {
                baseline: true,
                changes: [],
                fingerprint: "",
                comparedAsOf: null,
            })
            : { baseline: true, changes: [], fingerprint: "", comparedAsOf: null };
        const dps = trailingDividendPerShare(actions);
        const dividendAnalysis = {
            trailingDps: dps ?? null,
            payoutRatio: latest?.eps > 0 && dps != null ? dps / latest.eps : null,
            coverage: latest?.netIncome > 0 && latest?.freeCashFlow != null
                ? latest.freeCashFlow / latest.netIncome
                : null,
            events: actions.filter((a) => a.details.type === "dividend" && a.status !== "cancelled"),
        };
        const briefing = buildCompanyBriefing({ symbol, latest, prior, ratios });
        return {
            publisherResearch,
            refresh: { state: unavailable.length ? 'partial' : 'complete', failedSections: [...new Set(unavailable)], attemptedAt: new Date().toISOString() },
            reliability: researchReadiness({ quote, history: sorted, unavailable, technicalObservations: technicals.filter(t => t != null).length ? Math.min(...technicals.filter(t => t != null).map(t => t.timestamps.length)) : 0, estimateCount: earnings.filter(e => e.epsEstimate != null || e.revenueEstimate != null).length, ownershipCount: ownership.length }),
            diagnostics: companyDiagnostics(sorted, profile.company.sectorName ?? ''),
            quality,
            financialAnalysis,
            changes,
            scenarios: scenarios(latest),
            dividendAnalysis,
            quarterly,
            actions,
            sector: profile.company.sectorName ?? null,
            synthesis: buildResearchSynthesis(quote?.lastPrice ?? null, technicals.filter((item) => item != null), briefing.risks, [...new Set(unavailable)]),
            symbol,
            exchange,
            currency: profile.currency,
            companyName: profile.company.name,
            unavailable,
            generatedAt: new Date().toISOString(),
            quote,
            history: sorted,
            earnings,
            ownership,
            valuation,
            ratios,
            score,
            news: digest,
            technicals: technicals.filter((item) => item != null),
            briefing,
            estimates: earnings.filter((event) => event.epsEstimate != null || event.revenueEstimate != null),
            coverage: {
                annualPeriods: sorted.length,
                earningsEvents: earnings.length,
                shareholderDisclosures: ownership.length,
                valuationModels: valuation?.models.filter((model) => model.fairValue != null).length ??
                    0,
                analystEstimates: earnings.filter((event) => event.epsEstimate != null || event.revenueEstimate != null).length,
                insiderTransactions: false,
                orderDepth: false,
                optionsData: false,
            },
        };
    });
}
