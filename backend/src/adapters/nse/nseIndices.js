import { query } from '../../storage/db.js';
const names = { NASI: 'NSE All-Share Index', NSE20: 'NSE 20 Share Index', NSE25: 'NSE 25 Share Index' };
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
    return normalizeNseIndices(await readPublishedNseSummary());
}
export async function readPublishedNseSummary(){
    const result = await query(`SELECT e.tables FROM scraping.extractions e
    JOIN scraping.raw_artifacts a ON a.id = e.artifact_id
    JOIN scraping.sources s ON s.id=a.source_id
    WHERE a.source_id = 'nse-index-summary' AND a.document_url = 'https://www.nse.co.ke/'
      AND s.enabled AND length(trim(s.config->>'permissionReference')) BETWEEN 1 AND 200
      AND e.tables @> '[{"kind":"nse_index"}]'::jsonb
    ORDER BY a.retrieved_at DESC, e.extracted_at DESC LIMIT 1`);
    return result.rows[0]?.tables??[];
}
export async function readPublishedNseActivity(){
 const labels={SHARES:['Total shares traded','shares'],TURNOVER:['Equity turnover','KES'],ETF_UNITS:['ETF (U.T.D)','units'],ETF_KES:['ETF (KES)','KES']};
 return (await readPublishedNseSummary()).flatMap(row=>{
  if(row.kind!=='nse_statistic'||!labels[row.code]||!Number.isFinite(row.value)||row.value<0||!Number.isFinite(Date.parse(row.asOf))||Date.parse(row.asOf)>Date.now()+86400000)return [];
  return [{code:row.code,label:labels[row.code][0],unit:labels[row.code][1],value:row.value,change:Number.isFinite(row.change)?row.change:null,deals:row.code==='ETF_UNITS'&&Number.isSafeInteger(row.deals)&&row.deals>=0?row.deals:null,asOf:row.asOf}];
 });
}
