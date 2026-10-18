const positive = n => typeof n === 'number' && Number.isFinite(n) && n > 0;
const nonnegative = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
/** Current observed statistics. Unknown filing dates are disclosed, never invented. */
export function marketStatistics(quote, history, candles, closes, now = new Date()) {
    const usableQuote = quote?.source !== 'mock' && Number.isFinite(Date.parse(quote?.timestamp)) && Date.parse(quote.timestamp) <= now.getTime();
    const at = usableQuote ? quote.timestamp.slice(0, 10) : now.toISOString().slice(0, 10), price = usableQuote && positive(quote?.lastPrice) ? quote.lastPrice : null;
    const financial = [...history].filter(r => r.periodEnd && (!at || r.periodEnd.slice(0, 10) <= at)
        && (!r.reportedAt || r.reportedAt.slice(0, 10) <= at)
        && (!r.currency || !quote?.currency || r.currency === quote.currency))
        .sort((a, b) => b.fiscalYear - a.fiscalYear)[0];
    const shares = positive(financial?.sharesOutstanding) ? financial.sharesOutstanding : null;
    const eps = Number.isFinite(financial?.eps) ? financial.eps : Number.isFinite(financial?.netIncome) && shares ? financial.netIncome / shares : null;
    const marketCap = usableQuote && positive(quote?.marketCap) ? quote.marketCap : price && shares ? price * shares : null;
    const byDate = new Map(), conflicts = new Set();
    for (const row of closes) {
        const date = (row.date ?? row.timestamp ?? '').slice(0, 10);
        if (!positive(row.close)) continue;
        if (byDate.has(date) && byDate.get(date).close !== row.close) conflicts.add(date);
        else byDate.set(date, row);
    }
    for (const date of conflicts) byDate.delete(date);
    for (const row of candles) if (positive(row.close) && positive(row.high) && positive(row.low)) byDate.set(String(row.timestamp).slice(0, 10), row);
    const until = now.toISOString().slice(0, 10), since = new Date(now.getTime() - 365 * 86400000).toISOString().slice(0, 10);
    const observed = [...byDate].filter(([date]) => date >= since && date <= until).sort(([a], [b]) => a.localeCompare(b));
    const fullYear = observed.length >= 150 && Date.parse(observed[0]?.[0]) <= Date.parse(since) + 7 * 86400000
        && Date.parse(observed.at(-1)?.[0]) >= Date.parse(until) - 7 * 86400000
        && !observed.some(([date], i) => i > 0 && Date.parse(date) - Date.parse(observed[i - 1][0]) > 10 * 86400000);
    const completeOHLC = observed.every(([, r]) => positive(r.high) && positive(r.low));
    return {marketCap, marketCapBasis: usableQuote && positive(quote?.marketCap) ? 'reported_quote' : marketCap ? 'price_times_reported_shares' : 'unavailable',
        pe: price && positive(eps) ? price / eps : null, eps, volume: usableQuote && nonnegative(quote?.volume) ? quote.volume : null,
        high52: fullYear ? Math.max(...observed.map(([, r]) => completeOHLC ? r.high : r.close)) : null,
        low52: fullYear ? Math.min(...observed.map(([, r]) => completeOHLC ? r.low : r.close)) : null,
        rangeBasis: completeOHLC ? 'reported_daily_high_low' : 'observed_closing_prices',
        priceAsOf: quote?.timestamp ?? null, financialYear: financial?.fiscalYear ?? null,
        financialPeriodEnd: financial?.periodEnd ?? null, filingDate: financial?.reportedAt ?? null,
        financialBasis: financial?.basis ?? (financial ? 'reviewed_filing' : 'unavailable'),
        sourceUrls: financial?.sourceUrls ?? [], sharesAsOf: shares ? financial?.periodEnd : null,
        rangeCoverage: {observations: observed.length, from: observed[0]?.[0] ?? null, to: observed.at(-1)?.[0] ?? null, complete: fullYear},
        methodology: 'Market cap uses a reported quote or quoted price × last reported shares. P/E requires positive EPS. The 52-week range requires at least 150 dated observations, coverage near both boundaries and no gap over 10 days. Close-only extrema are labelled separately. No missing price, volume or filing date is generated.'};
}
