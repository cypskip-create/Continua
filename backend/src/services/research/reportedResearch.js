import { computeRatios } from './ratiosEngine.js';
import { annualRatioAt } from '../technical/valuationHistory.js';
export function reportedResearchRows(quote, history) {
    if (!quote?.timestamp) return [];
    const at=quote.timestamp.slice(0,10);
    return history.filter(r=>r.basis!=='publisher_observation' && r.periodEnd && r.reportedAt && r.periodEnd.slice(0,10)<=at && r.reportedAt.slice(0,10)<=at && (!r.currency || !quote.currency || r.currency===quote.currency) && r.sourceUrls?.some(u=>/^https:\/\//i.test(u)));
}
export function reportedResearchRatios(securityId, quote, history, dividendPerShare, now = new Date()) {
    if (!quote || quote.source === 'mock' || !Number.isFinite(quote.lastPrice) || quote.lastPrice <= 0 || !Number.isFinite(Date.parse(quote.timestamp)) || Date.parse(quote.timestamp) > now.getTime())
        return null;
    const rows = reportedResearchRows(quote,history);
    const latest = [...rows].sort((a, b) => b.fiscalYear - a.fiscalYear)[0];
    if (!latest)
        return null;
    const ratios = computeRatios({ ...latest, price: quote.lastPrice, dividendPerShareTtm: dividendPerShare });
    return { ...ratios, securityId, asOf: quote.timestamp,
        pe: annualRatioAt(rows, quote.lastPrice, quote.timestamp, 'pe').ratio ?? undefined,
        pb: annualRatioAt(rows, quote.lastPrice, quote.timestamp, 'pb').ratio ?? undefined,
        ps: annualRatioAt(rows, quote.lastPrice, quote.timestamp, 'ps').ratio ?? undefined };
}
