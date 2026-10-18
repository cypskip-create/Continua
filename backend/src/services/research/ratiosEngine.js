const safeDiv = (a, b) => {
    if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b) || b === 0)
        return undefined;
    return a / b;
};
const round4 = (n) => (n == null || !Number.isFinite(n) ? undefined : Math.round(n * 10000) / 10000);
export function computeRatios(i) {
    const eps = i.eps != null && Number.isFinite(i.eps) ? i.eps : safeDiv(i.netIncome, i.sharesOutstanding);
    const bookValuePerShare = safeDiv(i.totalEquity, i.sharesOutstanding);
    const marketCap = Number.isFinite(i.price) && Number.isFinite(i.sharesOutstanding) && i.sharesOutstanding > 0 ? i.price * i.sharesOutstanding : undefined;
    const enterpriseValue = marketCap != null && Number.isFinite(i.totalDebt) && Number.isFinite(i.cash) ? marketCap + i.totalDebt - i.cash : undefined;
    const priceMomentum3m = i.priceHistory90d && i.priceHistory90d.length >= 2
        ? round4((i.priceHistory90d[i.priceHistory90d.length - 1] - i.priceHistory90d[0]) / i.priceHistory90d[0])
        : undefined;
    const volatility90d = i.priceHistory90d && i.priceHistory90d.length >= 3
        ? round4(computeAnnualizedVolatility(i.priceHistory90d))
        : undefined;
    return {
        pe: round4(safeDiv(i.price, eps)),
        ps: round4(safeDiv(marketCap, i.revenue)),
        pb: round4(safeDiv(i.price, bookValuePerShare)),
        evEbitda: round4(safeDiv(enterpriseValue, i.ebitda ?? undefined)),
        roe: round4(safeDiv(i.netIncome, i.totalEquity)),
        roa: round4(safeDiv(i.netIncome, i.totalAssets)),
        roic: round4(safeDiv(i.operatingIncome ?? undefined, i.totalEquity == null || i.totalDebt == null ? undefined : i.totalEquity + i.totalDebt)),
        grossMargin: round4(safeDiv(i.grossProfit ?? undefined, i.revenue)),
        operatingMargin: round4(safeDiv(i.operatingIncome ?? undefined, i.revenue)),
        netMargin: round4(safeDiv(i.netIncome, i.revenue)),
        dividendYield: round4(safeDiv(i.dividendPerShareTtm ?? undefined, i.price)),
        payoutRatio: round4(safeDiv(i.dividendPerShareTtm ?? undefined, eps)),
        currentRatio: round4(safeDiv(i.currentAssets ?? undefined, i.currentLiabilities ?? undefined)),
        debtToEquity: round4(safeDiv(i.totalDebt ?? undefined, i.totalEquity)),
        interestCoverage: round4(safeDiv(i.operatingIncome ?? undefined, i.interestExpense ?? undefined)),
        priceMomentum3m,
        volatility90d,
    };
}
function computeAnnualizedVolatility(prices) {
    const returns = [];
    for (let idx = 1; idx < prices.length; idx++) {
        returns.push(Math.log(prices[idx] / prices[idx - 1]));
    }
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);
    const dailyStdDev = Math.sqrt(variance);
    return dailyStdDev * Math.sqrt(252); // annualized
}
export function yoyGrowth(current, prior) {
    if (!Number.isFinite(current) || !Number.isFinite(prior) || prior === 0)
        return undefined;
    return (current - prior) / Math.abs(prior);
}
