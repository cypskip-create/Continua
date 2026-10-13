import { query } from '../../storage/db.js';
const names = { NASI: 'NSE All-Share Index', NSE20: 'NSE 20 Share Index', NSE25: 'NSE 25 Share Index', NSE10: 'NSE 10 Share Index' };
export function normalizeNseIndices(rows, now = Date.now()) {
    if (!Array.isArray(rows))
        return [];
    return rows.flatMap((row) => {
        if (row?.kind !== 'nse_index' || !names[row.code] || !Number.isFinite(row.value) || !Number.isFinite(row.change))
            return [];
        const timestamp = Date.parse(row.asOf);
        const previousClose = row.value - row.change;
        if (!Number.isFinite(timestamp) || timestamp > now + 86_400_000 || row.value <= 0 || previousClose <= 0)
            return [];
        return [{ id: `NSE:index:${row.code}`, code: row.code, name: names[row.code], exchange: 'NSE',
                value: row.value, previousClose, change: row.change, changePercent: row.change / previousClose * 100,
                currency: 'KES', timestamp: new Date(timestamp).toISOString(), source: 'eod' }];
    });
}
/** Scraper owns external fetching/robots/provenance; backend validates and
 * publishes only observations from the configured official NSE source. */
export async function readPublishedNseIndices() {
    const result = await query(`SELECT e.tables FROM scraping.extractions e
    JOIN scraping.raw_artifacts a ON a.id = e.artifact_id
    WHERE a.source_id = 'nse-index-summary' AND a.document_url = 'https://www.nse.co.ke/'
      AND e.tables @> '[{"kind":"nse_index"}]'::jsonb
    ORDER BY a.retrieved_at DESC, e.extracted_at DESC LIMIT 1`);
    return normalizeNseIndices(result.rows[0]?.tables);
}
