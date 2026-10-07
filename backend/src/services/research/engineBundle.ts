import { buildResearchSynthesis } from "./engineSynthesis.js";
import { summarizeNews } from "./newsDigest.js";
import { newsRepository } from "../../storage/repositories/newsRepository.js";
import { indicatorsService } from "../technical/indicatorsService.js";
import { securitiesRepository } from "../../storage/repositories/securitiesRepository.js";
import { pricesRepository } from "../../storage/repositories/pricesRepository.js";
import { financialsRepository } from "../../storage/repositories/financialsRepository.js";
import { corporateActionsRepository } from "../../storage/repositories/corporateActionsRepository.js";
import { researchService } from "./researchService.js";
import { valuationService } from "../../services/technical/valuationService.js";
import { buildCompanyBriefing } from "./engineBriefing.js";
import { cache } from "../../storage/cache.js";


import type { ExchangeCode } from "../../config/index.js";
import { ApiError } from "../../api/middleware/errorHandler.js";
import { analyzeFinancials, dataQuality, scenarios, type ResearchState } from "./engineAnalytics.js";
import { engineRepository } from "../../storage/repositories/engineRepository.js";
import { trailingDividendPerShare } from "./dividendMetrics.js";
export async function getEngineBundle(symbol:string,exchange:ExchangeCode) {
  return cache.getOrSet(`engine:v3:${exchange}:${symbol}`, 60_000, async () => {
    const profile = await securitiesRepository.getCompanyProfile(exchange, symbol);
    if (!profile) throw new ApiError(404, "This stock is not covered yet");
    const unavailable: string[] = [];
    const optional = async <T>(name: string, request: Promise<T>, fallback: T): Promise<T> => {
      try { return await request; } catch { unavailable.push(name); return fallback; }
    };
    const [quote, history, earnings, ownership, valuation, ratios, score, news, technicals, actions, quarterly] = await Promise.all([
      optional("Quote", pricesRepository.getQuote(profile.id), null),
      optional("Financial statements", financialsRepository.getHistoricalPeriods(profile.id, "annual", 10), []),
      optional("Earnings", corporateActionsRepository.getEarningsBySecurity(profile.id), []),
      optional("Ownership", corporateActionsRepository.getOwnership(profile.id), []),
      optional("Valuation", valuationService.compute(exchange, symbol), null),
      optional("Ratios", researchService.getRatios(profile.id), null),
      optional("Company score", researchService.getAfriScore(profile.id), null),
      optional("News", newsRepository.listBySecurity(profile.id, 12), []),
      optional("Technicals", Promise.all((["SMA", "RSI", "MACD"] as const).map(type => indicatorsService.compute({ exchange, symbol, type, from: new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) }))), []),
      optional("Corporate actions", corporateActionsRepository.getBySecurity(profile.id), []),
      optional("Quarterly statements", financialsRepository.getHistoricalPeriods(profile.id, "quarterly", 12), []),
    ]);
    const digest = await Promise.all(news.filter(item => !item.needsReview).slice(0, 6).map(async item => {
      const article = await optional("Article text", newsRepository.getById(item.id), null);
      return { id: item.id, headline: item.headline, ...summarizeNews(item.headline, article?.content, item.excerpt), source: item.sourceName, url: item.articleUrl, publishedAt: item.publishedAt, impact: item.impact };
    }));
    const sorted = [...history].sort((a, b) => a.fiscalYear - b.fiscalYear);
    const latest = sorted.at(-1), prior = sorted.at(-2);
    const financialAnalysis=analyzeFinancials(sorted,profile.company.sectorName??"");
    const quality=dataQuality(quote,sorted);
    const state:ResearchState={fiscalYear:latest?.fiscalYear??null,revenue:latest?.revenue??null,netIncome:latest?.netIncome??null,debtToEquity:financialAnalysis.metrics.debtToEquity,fairValue:valuation?.models.find(m=>m.fairValue!=null)?.fairValue??null,newsIds:digest.map(n=>n.id).sort(),ownership:ownership.map(h=>({name:h.holderName,percent:h.percentHeld})).sort((a,b)=>a.name.localeCompare(b.name))};
    const changes=unavailable.length===0?await optional("Change history",engineRepository.observe(profile.id,state),{baseline:true,changes:[],fingerprint:"",comparedAsOf:null}):{baseline:true,changes:[],fingerprint:"",comparedAsOf:null};
    const dps=trailingDividendPerShare(actions);
    const dividendAnalysis={trailingDps:dps??null,payoutRatio:latest?.eps>0&&dps!=null?dps/latest.eps:null,coverage:latest?.netIncome>0&&latest?.freeCashFlow!=null?latest.freeCashFlow/latest.netIncome:null,events:actions.filter(a=>a.details.type==="dividend"&&a.status!=="cancelled")};
    const briefing = buildCompanyBriefing({ symbol, latest, prior, ratios });
    return {
      quality,financialAnalysis,changes,scenarios:scenarios(latest),dividendAnalysis,quarterly,actions,sector:profile.company.sectorName??null,
      synthesis: buildResearchSynthesis(quote?.lastPrice ?? null, technicals.filter(item => item != null), briefing.risks, [...new Set(unavailable)]),
      symbol, exchange, currency: profile.currency, companyName: profile.company.name,
      unavailable, generatedAt: new Date().toISOString(), quote, history: sorted, earnings, ownership, valuation, ratios, score,
      news: digest,
      technicals: technicals.filter(item => item != null),
      briefing,
      estimates: earnings.filter(event => event.epsEstimate != null || event.revenueEstimate != null),
      coverage: {
        annualPeriods: sorted.length, earningsEvents: earnings.length, shareholderDisclosures: ownership.length,
        valuationModels: valuation?.models.filter(model => model.fairValue != null).length ?? 0,
        analystEstimates: earnings.filter(event => event.epsEstimate != null || event.revenueEstimate != null).length,
        insiderTransactions: false, orderDepth: false, optionsData: false,
      },
    };
  });
}
