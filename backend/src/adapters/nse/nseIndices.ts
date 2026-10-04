import { query } from '../../storage/db.js';
import type { MarketIndex } from '../../types/market.js';

const names: Record<string, string> = { NASI: 'NSE All-Share Index', NSE20: 'NSE 20 Share Index', NSE25: 'NSE 25 Share Index', NSE10: 'NSE 10 Share Index' };
export function normalizeNseIndices(rows: unknown, now = Date.now()): MarketIndex[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    if (row?.kind !== 'nse_index' || !names[row.code] || !Number.isFinite(row.value) || !Number.isFinite(row.change)) return [];
    const timestamp = Date.parse(row.asOf);
    const previousClose = row.value - row.change;
    if (!Number.isFinite(timestamp) || timestamp > now + 86_400_000 || row.value <= 0 || previousClose <= 0) return [];
    return [{ id: `NSE:index:${row.code}`, code: row.code, name: names[row.code]!, exchange: 'NSE' as const,
      value: row.value, previousClose, change: row.change, changePercent: row.change / previousClose * 100,
      currency: 'KES' as const, timestamp: new Date(timestamp).toISOString(), source: 'eod' as const }];
  });
}

/** Scraper owns external fetching/robots/provenance; backend validates and
 * publishes only observations from the configured official NSE source. */
export async function readPublishedNseIndices(): Promise<MarketIndex[]> {
  const result = await query<{ tables: unknown }>(`SELECT e.tables FROM scraping.extractions e
    JOIN scraping.raw_artifacts a ON a.id = e.artifact_id
    WHERE a.source_id = 'nse-index-summary' AND a.document_url = 'https://www.nse.co.ke/'
      AND e.tables @> '[{"kind":"nse_index"}]'::jsonb
    ORDER BY a.retrieved_at DESC, e.extracted_at DESC LIMIT 1`);
  return normalizeNseIndices(result.rows[0]?.tables);
}
