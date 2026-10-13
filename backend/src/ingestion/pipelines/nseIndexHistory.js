import { query } from '../../storage/db.js';
import { MarketResearchRecordSchema } from '../normalizers/marketResearchRecord.js';
/** Only the enabled official collector's dated/validated closing observations
 * can extend the history chart. No interpolation or scrape-time substitution. */
export async function publishNseIndexHistory(indices) {
    const source = await query("SELECT enabled,config->>'permissionReference' AS permission_reference FROM scraping.sources WHERE id='nse-index-summary'");
    const permission = source.rows[0];
    if (!permission?.enabled || !permission.permission_reference)
        return;
    for (const index of indices) {
        if (index.exchange !== 'NSE' || index.source !== 'eod')
            continue;
        const parsed = MarketResearchRecordSchema.safeParse({ id: `nse-index:${index.code}:${new Date(index.timestamp).toISOString().slice(0, 10)}`, kind: 'market_statistics', title: index.name, symbol: null, observedAt: index.timestamp, sourceUrl: 'https://www.nse.co.ke/', payload: { indicator: index.code, actual: index.value, previous: index.previousClose, change: index.change, unit: 'points', permissionReference: permission.permission_reference } });
        if (!parsed.success)
            continue;
        const r = parsed.data;
        await query(`INSERT INTO market.research_records(id,kind,title,symbol,observed_at,source_url,payload,verified_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,now()) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now(),verified_at=now()
   WHERE market.research_records.source_url=EXCLUDED.source_url AND market.research_records.payload IS DISTINCT FROM EXCLUDED.payload`, [r.id, r.kind, r.title, r.symbol, r.observedAt, r.sourceUrl, JSON.stringify(r.payload)]);
    }
}
