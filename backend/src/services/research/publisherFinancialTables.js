import { query } from '../../storage/db.js';
import { z } from 'zod';
// Preserve the original UTF-16 size boundary across Zod versions.
const boundedText = maximum => z.string().max(maximum).refine(value => value.length <= maximum);
const tableSchema = z.object({ kind: z.literal('publisher_table'), tab: z.literal('Financials'), category: boundedText(60),
    columns: z.array(boundedText(80)).min(2).max(25), rows: z.array(z.object({ label: boundedText(500), rowKind: z.enum(['item', 'total', 'group']),
        cells: z.array(z.object({ raw: boundedText(100) })).max(24) })).max(500) });
/** Source-observed tables are deliberately separate from canonical filings.
 * Exact labels/years/raw precision are preserved; no scope/date/EPS is invented. */
export function sourceFinancialTables(raw) {
    if (!Array.isArray(raw))
        return [];
    return raw.flatMap(t => {
        const parsed = tableSchema.safeParse(t);
        if (!parsed.success)
            return [];
        const table = parsed.data, years = table.columns.slice(1);
        if (!years.every(y => /^20\d{2}$/.test(y) && Number(y) >= 2015 && Number(y) <= new Date().getUTCFullYear()) || new Set(years).size !== years.length)
            return [];
        if (table.rows.some(r => r.rowKind !== 'group' && r.cells.length !== years.length))
            return [];
        return [{ category: table.category, columns: table.columns, rows: table.rows.map(r => ({ label: r.label, rowKind: r.rowKind, values: r.cells.map(c => c.raw) })) }];
    });
}
export async function publisherFinancialTables(symbol) {
    const ticker = { DTB: 'DTK', STANBIC: 'SBIC', HFCB: 'HFCK' }[symbol] ?? symbol;
    if (!/^[A-Z0-9-]{1,20}$/.test(ticker))
        return [];
    const result = await query(`SELECT DISTINCT ON (a.metadata->>'category') e.tables,a.document_url,a.retrieved_at
  FROM scraping.extractions e JOIN scraping.raw_artifacts a ON a.id=e.artifact_id JOIN scraping.sources s ON s.id=a.source_id
  WHERE a.source_id='kenyanstocks' AND s.enabled AND s.redistribution_allowed=true
  AND e.entity->>'ticker'=$1 AND a.sha256 ~ '^[a-f0-9]{64}$' AND a.metadata->>'tab'='Financials'
  AND a.content_type LIKE 'text/html%' ORDER BY a.metadata->>'category',e.extracted_at DESC,e.id DESC`, [ticker]);
    return result.rows.flatMap(row => {
        let url;
        try {
            url = new URL(row.document_url);
        }
        catch {
            return [];
        }
        if (url.origin !== 'https://kenyanstocks.com' || url.pathname !== `/stock/nse/${ticker}` || url.searchParams.get('tab') !== 'Financials')
            return [];
        return sourceFinancialTables(row.tables).map(table => ({ ...table, sourceUrl: url.href, observedAt: row.retrieved_at, status: 'publisher_observation' }));
    });
}
