import { HistoricalConfirmSchema } from '../confirmHistoricalColumns.js';
export const SAFARICOM_PRESS_VERSION = 'safaricom-native-bn-comparatives-v1';
/** Verified legacy issuer results layout. EPS and unreported balance totals
 * remain unknown. First observed date is conservative availability, NOT an
 * invented original release date. No historical backtest gets early access. */
export function validateSafaricomPressReport(text, observedAt) {
    if (!/SAFARICOM LIMITED ANNOUNCES AUDITED RESULTS FOR THE YEAR ENDED 31 MARCH 2016/i.test(text))
        throw new Error('Unsupported legacy issuer results template');
    const entries = [];
    const spans = [{ start: 'Condensed consolidated statement of comprehensive income', end: 'Condensed consolidated statement of financial position', type: 'income', page: 6 }, { start: 'Free Cash flow', end: null, type: 'cashflow', page: 8 }];
    for (const span of spans) {
        const start = text.indexOf(span.start), end = span.end ? text.indexOf(span.end, start + span.start.length) : text.length;
        if (start < 0 || end < start)
            throw new Error('Missing legacy results section');
        const block = text.slice(start, end);
        if (!/Kshs bn/i.test(block) || !/31-Mar-16\s+31-Mar-15/.test(block))
            throw new Error('Explicit billion units and dated comparatives required');
        const rows = [];
        const cell = '(?:\\(\\d[\\d,]*(?:\\.\\d+)?\\)|-?\\d[\\d,]*(?:\\.\\d+)?)';
        const pattern = new RegExp(`^(.+?)\\s+(${cell})\\s+(${cell})(?:\\s+.*)?$`);
        for (const line of block.split(/\r?\n/)) {
            const match = line.trim().match(pattern);
            if (match && /[a-z]/i.test(match[1]))
                rows.push({ label: match[1].trim(), values: [match[2], match[3]] });
        }
        const find = (label) => {
            const matches = rows.filter(row => label.test(row.label));
            if (matches.length !== 1)
                throw new Error(`Missing or duplicate legacy row: ${label.source}`);
            return matches[0].values.map(v => Number(v.replace(/[(),]/g, '')) * (v.startsWith('(') ? -1 : 1));
        };
        const mapped = {};
        if (span.type === 'income') {
            mapped.revenue = find(/^Total Revenue$/i);
            mapped.netIncome = find(/^Net Income$/i);
            mapped.ebitda = find(/^EBITDA$/i);
            const before = find(/^Earnings Before Taxation$/i), tax = find(/^Taxation$/i);
            for (let i = 0; i < 2; i++)
                if (mapped.revenue[i] <= 0 || Math.abs(before[i] - Math.abs(tax[i]) - mapped.netIncome[i]) > 0.030001)
                    throw new Error('Legacy rounded tax reconciliation failed');
        }
        else {
            mapped.freeCashFlow = find(/^Free cash flow$/i);
            mapped.capex = find(/^Capital Additions$/i).map(Math.abs);
        }
        const confirmation = HistoricalConfirmSchema.parse({ securityId: 'NSE:SCOM', statementType: span.type, unitsVerified: true, periods: [2016, 2015].map((fiscalYear, columnIndex) => ({
                columnIndex, period: { periodType: 'annual', fiscalYear, periodEnd: `${fiscalYear}-03-31`, reportedAt: observedAt, currency: 'KES' },
                [span.type]: Object.fromEntries(Object.entries(mapped).map(([key, values]) => [key, Math.round(values[columnIndex] * 1e9)])), sourcePage: span.page,
                note: `Automatic ${SAFARICOM_PRESS_VERSION}: visually verified source template and KES billion comparative columns. Original release date is unknown; availability uses first archived observation ${observedAt}. No EPS or CFO inferred.`,
            })) });
        entries.push({ table: { title: span.start, headerLine: '31-Mar-16 31-Mar-15', rows, method: SAFARICOM_PRESS_VERSION, confidence: 1 }, confirmation });
    }
    return entries;
}
