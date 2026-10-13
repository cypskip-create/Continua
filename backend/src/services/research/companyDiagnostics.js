const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const ratio = (a, b) => finite(a) && finite(b) && b > 0 ? a / b : null;
export function companyDiagnostics(history) {
    const rows = [...history].sort((a, b) => a.fiscalYear - b.fiscalYear), last = rows.at(-1), prior = rows.find(r => r.fiscalYear === (last?.fiscalYear ?? 0) - 1);
    const trends = rows.map(r => ({ year: r.fiscalYear, netMargin: ratio(r.netIncome, r.revenue), roe: ratio(r.netIncome, r.totalEquity), cashConversion: ratio(r.operatingCashFlow, r.netIncome), accrualsToAssets: finite(r.netIncome) && finite(r.operatingCashFlow) ? ratio(r.netIncome - r.operatingCashFlow, r.totalAssets) : null, sourceUrls: r.sourceUrls ?? [], reportedAt: r.reportedAt ?? null }));
    const checks = [];
    const add = (id, label, value, reason) => checks.push({ id, label, result: value == null ? 'unknown' : value ? 'pass' : 'flag', reason });
    add('profit', 'Positive earnings', finite(last?.netIncome) ? last.netIncome > 0 : null, 'Latest reported annual net income; a loss is not automatically a bad investment.');
    add('cash', 'Operating cash supports profit', finite(last?.operatingCashFlow) && finite(last?.netIncome) && last.netIncome > 0 ? last.operatingCashFlow >= last.netIncome : null, 'Requires positive profit and reported operating cash flow from the same period.');
    const lm = ratio(last?.netIncome, last?.revenue), pm = ratio(prior?.netIncome, prior?.revenue);
    add('margin', 'Net margin did not deteriorate', lm != null && pm != null ? lm >= pm : null, 'Compares only the adjacent prior fiscal year, never a distant archived year.');
    add('dilution', 'Reported share count did not increase', finite(last?.sharesOutstanding) && finite(prior?.sharesOutstanding) && prior.sharesOutstanding > 0 ? last.sharesOutstanding <= prior.sharesOutstanding : null, 'Changes may be corporate actions, not issuance; review the share disclosures.');
    const ld = ratio(last?.totalDebt, last?.totalEquity), pd = ratio(prior?.totalDebt, prior?.totalEquity);
    add('leverage', 'Debt/equity did not rise', ld != null && pd != null ? ld <= pd : null, 'Generic debt/equity is not a bank regulatory-capital measure.');
    const liquidity = ratio(last?.currentAssets, last?.currentLiabilities);
    add('liquidity', 'Current assets cover current liabilities', liquidity != null ? liquidity >= 1 : null, 'A simple reported liquidity check, not a sector-specific solvency judgment.');
    const evidence = rows.flatMap(r => Object.entries(r).filter(([field, value]) => finite(value) && !['fiscalYear', 'fiscalQuarter'].includes(field)).map(([field, value]) => ({ year: r.fiscalYear, field, value: value, periodEnd: r.periodEnd ?? null, availableAt: r.reportedAt ?? null, sourceUrls: r.sourceUrls ?? [], basis: r.sourceUrls?.length ? 'Reviewed filing' : 'Stored figure without reviewed URL' })));
    return { trends, checks, knownChecks: checks.filter(c => c.result !== 'unknown').length, totalChecks: checks.length, evidence,
        methodology: 'Reported-period diagnostics, not a proprietary rating, trading recommendation or probability of success. Missing inputs remain unknown. Source availability dates can be later than period ends.' };
}
