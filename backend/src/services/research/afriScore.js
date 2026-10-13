/** Maps a raw metric to 0-100 on a scale from `worst` to `best`. `best` can
 *  be numerically lower than `worst` — pass them in whichever order matches
 *  reality (e.g. normalize(pe, 30, 5) because a PE of 30 is worse than 5;
 *  normalize(roe, 0, 0.3) because 0.3 is better than 0) and the function
 *  handles both ascending and descending scales identically. Values beyond
 *  either anchor are clamped, not extrapolated. */
function normalize(value, worst, best) {
    if (value == null || !Number.isFinite(value))
        return null;
    const clamped = Math.min(Math.max(value, Math.min(worst, best)), Math.max(worst, best));
    return ((clamped - worst) / (best - worst)) * 100;
}
function weightedAverage(parts) {
    const usable = parts.filter((p) => p.score != null);
    if (usable.length === 0)
        return 50; // neutral default when we have no signal at all
    const totalWeight = usable.reduce((sum, p) => sum + p.weight, 0);
    const weighted = usable.reduce((sum, p) => sum + p.score * p.weight, 0);
    return Math.round((weighted / totalWeight) * 10) / 10;
}
/**
 * AfriValue — cheap vs. expensive, relative to typical NSE ranges. Lower
 * PE/PB/EV-EBITDA score higher (undervalued signal).
 */
function afriValue(r) {
    return weightedAverage([
        { score: normalize(r.pe, 30, 5), weight: 0.4 }, // PE 5 (cheap) → 30 (expensive)
        { score: normalize(r.pb, 6, 0.5), weight: 0.3 },
        { score: normalize(r.evEbitda, 20, 4), weight: 0.3 },
    ]);
}
/** AfriGrowth — revenue/earnings momentum. */
function afriGrowth(i) {
    return weightedAverage([
        { score: normalize(i.revenueGrowthYoy, -0.1, 0.3), weight: 0.4 },
        { score: normalize(i.epsGrowthYoy, -0.2, 0.4), weight: 0.4 },
        { score: normalize(i.fiveYearRevenueCagr, -0.05, 0.2), weight: 0.2 },
    ]);
}
/** AfriHealth — balance sheet strength / solvency. */
function afriHealth(r) {
    return weightedAverage([
        { score: normalize(r.currentRatio, 0.5, 2.5), weight: 0.35 },
        { score: normalize(r.debtToEquity, 2, 0), weight: 0.4 },
        { score: normalize(r.interestCoverage, 1, 10), weight: 0.25 },
    ]);
}
/** AfriIncome — dividend attractiveness + sustainability. */
function afriIncome(r) {
    return weightedAverage([
        { score: normalize(r.dividendYield, 0, 0.1), weight: 0.6 },
        // A payout ratio near 100% (or above) is a red flag for sustainability.
        { score: normalize(r.payoutRatio, 1.1, 0.4), weight: 0.4 },
    ]);
}
/** AfriRisk — volatility + leverage; scored so HIGHER = LOWER risk, to stay
 *  consistent with every other sub-score ("higher is better"). */
function afriRisk(r) {
    return weightedAverage([
        { score: normalize(r.volatility90d, 0.6, 0.15), weight: 0.6 },
        { score: normalize(r.debtToEquity, 2.5, 0), weight: 0.4 },
    ]);
}
/** AfriQuality — profitability efficiency (ROE/ROA/margins). */
function afriQuality(r) {
    return weightedAverage([
        { score: normalize(r.roe, 0, 0.3), weight: 0.35 },
        { score: normalize(r.roa, 0, 0.15), weight: 0.25 },
        { score: normalize(r.netMargin, 0, 0.3), weight: 0.4 },
    ]);
}
/** AfriMomentum — recent price trend. */
function afriMomentum(r) {
    return weightedAverage([{ score: normalize(r.priceMomentum3m, -0.2, 0.3), weight: 1 }]);
}
/** Overall AfriScore — a weighted blend of all seven, tuned to lean
 *  slightly toward quality + health (capital preservation) over pure
 *  momentum, appropriate for a long-horizon investing audience. Weights are
 *  a single named constant so they're easy to find and tune later. */
export const AFRI_SCORE_WEIGHTS = {
    value: 0.20, growth: 0.15, health: 0.20, income: 0.10, risk: 0.15, quality: 0.15, momentum: 0.05,
};
export function computeAfriScore(securityId, inputs) {
    const value = afriValue(inputs.ratios);
    const growth = afriGrowth(inputs);
    const health = afriHealth(inputs.ratios);
    const income = afriIncome(inputs.ratios);
    const risk = afriRisk(inputs.ratios);
    const quality = afriQuality(inputs.ratios);
    const momentum = afriMomentum(inputs.ratios);
    const composite = Math.round(value * AFRI_SCORE_WEIGHTS.value + growth * AFRI_SCORE_WEIGHTS.growth + health * AFRI_SCORE_WEIGHTS.health +
        income * AFRI_SCORE_WEIGHTS.income + risk * AFRI_SCORE_WEIGHTS.risk + quality * AFRI_SCORE_WEIGHTS.quality +
        momentum * AFRI_SCORE_WEIGHTS.momentum);
    return {
        securityId,
        afriScore: composite,
        afriValue: value, afriGrowth: growth, afriHealth: health, afriIncome: income,
        afriRisk: risk, afriQuality: quality, afriMomentum: momentum,
        inputs: {
            pe: inputs.ratios.pe ?? null, pb: inputs.ratios.pb ?? null, roe: inputs.ratios.roe ?? null,
            debtToEquity: inputs.ratios.debtToEquity ?? null, dividendYield: inputs.ratios.dividendYield ?? null,
            volatility90d: inputs.ratios.volatility90d ?? null, revenueGrowthYoy: inputs.revenueGrowthYoy ?? null,
            epsGrowthYoy: inputs.epsGrowthYoy ?? null,
        },
    };
}
