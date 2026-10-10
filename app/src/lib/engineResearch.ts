import type { FinancialHistoryEntry, OwnershipRecord } from "../api/types";
import { finiteFinancial, growthPercent } from "./financialPresentation.ts";
export function reportBridge(history: FinancialHistoryEntry[]) {
    return [...history].sort((a, b) => a.fiscalYear - b.fiscalYear || (a.fiscalQuarter ?? 0) - (b.fiscalQuarter ?? 0)).map(row => {
        const prior = row.currency ? history.find(p => p.fiscalYear === row.fiscalYear - 1 && (p.fiscalQuarter ?? null) === (row.fiscalQuarter ?? null) && p.currency === row.currency) : undefined;
        const revenue = finiteFinancial(row.revenue), income = finiteFinancial(row.netIncome), cash = finiteFinancial(row.operatingCashFlow);
        return { row, revenueGrowth: prior ? growthPercent(revenue, prior.revenue) : null,
            margin: revenue != null && revenue > 0 && income != null ? income / revenue * 100 : null,
            cashConversion: income != null && income > 0 && cash != null ? cash / income : null,
            cashProfitGap: cash != null && income != null ? cash - income : null };
    });
}
export function ownershipSnapshot(records: OwnershipRecord[], date: string) {
    // Never combine different disclosure dates into a misleading ownership total.
    const rows = records.filter(r => r.asOf === date);
    const usable = rows.map(r => finiteFinancial(r.percentHeld)).filter((n): n is number => n != null && n >= 0 && n <= 100);
    return { rows, disclosedPercent: usable.length ? usable.reduce((a, b) => a + b, 0) : null, invalid: rows.length - usable.length };
}
export function concentration(weights: number[]) {
    const valid = weights.filter(w => Number.isFinite(w) && w > 0);
    const sum = valid.reduce((a, b) => a + b, 0);
    if (!sum)
        return { topThree: null, effectiveHoldings: null };
    const normalized = valid.map(w => w / sum).sort((a, b) => b - a);
    return { topThree: normalized.slice(0, 3).reduce((a, b) => a + b, 0) * 100, effectiveHoldings: 1 / normalized.reduce((a, b) => a + b * b, 0) };
}
export function multipleSensitivity(eps: unknown, stressPercent: number, multiple: number) {
    const n = finiteFinancial(eps);
    return n != null && n > 0 && Number.isFinite(stressPercent) && stressPercent >= -100 && Number.isFinite(multiple) && multiple >= 0 ? n * (1 + stressPercent / 100) * multiple : null;
}
