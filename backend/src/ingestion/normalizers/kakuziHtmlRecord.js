import { HistoricalConfirmSchema } from '../confirmHistoricalColumns.js';
export const KAKUZI_HTML_VERSION = 'kakuzi-five-year-html-2025-v1';
/** Verified issuer table, not a general HTML financial inference engine.
 * Availability is first archive observation, NOT an invented release date. */
export function validateKakuziHtmlRecord(text, tables, securityId, observedDate) {
    if (securityId !== 'NSE:KUKZ' || !/Five Year Record/.test(text) || !/All amounts are stated in Kenyan shillings thousands \(shs[’']000\) except where otherwise indicated\./i.test(text))
        throw new Error('Kakuzi HTML identity and explicit units required');
    const matching = tables.filter(t => t.method === 'html_table_v1' && t.headerLine?.replace(/\s+/g, '') === "|2025Shs'000|2024Shs'000|2023Shs'000|2022Shs'000|2021Shs'000");
    if (matching.length !== 1)
        throw new Error('Exact verified five-year column order required');
    const table = matching[0];
    const find = (label) => {
        const rows = table.rows.filter(r => label.test(r.label));
        if (rows.length !== 1 || rows[0].values.length !== 5)
            throw new Error('Unique complete five-year row required');
        return rows[0].values.map(v => {
            if (!/^\(?-?\d[\d,]*(?:\.\d+)?\)?$/.test(v) || (/^\(/.test(v) !== /\)$/.test(v)) || v.includes('(-'))
                throw new Error('Unambiguous numeric cell required');
            return Number(v.replace(/[(),]/g, '')) * (v.startsWith('(') ? -1 : 1);
        });
    };
    const revenue = find(/^Turnover$/), netIncome = find(/^\(Loss\)\/Profit attributable to the members of Kakuzi Plc$/), eps = find(/^Basic earnings per ordinary share \(Shs\)$/);
    const other = find(/^Other comprehensive income$/), total = find(/^Total comprehensive\(Loss\)\/income$/);
    if (netIncome.some((v, i) => Math.abs(v + other[i] - total[i]) > 1) || revenue.some(v => v <= 0) || eps.some((v, i) => Math.sign(v) !== Math.sign(netIncome[i])))
        throw new Error('Comprehensive income or earnings reconciliation failed');
    const confirmation = HistoricalConfirmSchema.parse({ securityId, statementType: 'income', unitsVerified: true, periods: [2025, 2024, 2023, 2022, 2021].map((year, columnIndex) => ({ columnIndex, period: { periodType: 'annual', fiscalYear: year, periodEnd: `${year}-12-31`, reportedAt: observedDate, currency: 'KES' }, income: { revenue: revenue[columnIndex] * 1000, netIncome: netIncome[columnIndex] * 1000, eps: eps[columnIndex] }, sourcePage: 1, note: `${KAKUZI_HTML_VERSION}: official issuer five-year record; turnover and attributable earnings in KES thousands, EPS in shillings. Net earnings plus other comprehensive income reconciles to total comprehensive income. December fiscal year verified against issuer annual report. Conservative availability is first archive observation, not original release date. Equity-only row cannot establish a full balance sheet; no cash flow or balance sheet invented.` })) });
    return [{ table, confirmation }];
}
