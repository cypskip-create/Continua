export const monitoringKinds = ["material_change", "price_below", "price_above", "debt_above", "revenue_growth_below", "earnings_growth_below", "cash_conversion_below", "dividend_payout_above", "quote_age_above","daily_gain_above","daily_loss_below","volume_above"];
export function evaluateMonitor(rule, state) {
    if (rule.kind === "material_change")
        return { triggered: false, fingerprint: state.fingerprint, notify: !!rule.last_state && rule.last_state.fingerprint !== state.fingerprint && state.material };
    const values = { price_below: state.quoteFresh ? state.price : null, price_above: state.quoteFresh ? state.price : null, debt_above: state.debt, revenue_growth_below: state.growth, earnings_growth_below: state.earningsGrowth, cash_conversion_below: state.cashConversion, dividend_payout_above: state.dividendPayout, quote_age_above: state.quoteAge, daily_gain_above:state.quoteFresh?state.dailyChange:null,daily_loss_below:state.quoteFresh?state.dailyChange:null,volume_above:state.quoteFresh?state.volume:null };
    const value = values[rule.kind];
    if (value == null || !Number.isFinite(value) || rule.threshold == null)
        return { triggered: rule.last_state?.triggered ?? false, fingerprint: state.fingerprint, notify: false, unavailable: true, value: null };
    const triggered = rule.kind.endsWith("above") ? value > rule.threshold : value < rule.threshold;
    return { triggered, fingerprint: state.fingerprint, notify: triggered && rule.last_state?.triggered !== true, unavailable: false, value };
}
