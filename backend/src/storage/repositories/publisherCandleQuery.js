// Engine-validated daily observations are durable in Supabase, not browser state.
// Keep separate from canonical candles: unknown adjustment is not certification.
export function publisherHistoryQuery(closeOnly=false) {return `WITH latest AS (
 SELECT p.payload,a.document_url,a.source_id,e.extracted_at,e.id FROM scraping.processed_research p
 JOIN scraping.extractions e ON e.id=p.extraction_id
 JOIN scraping.raw_artifacts a ON a.id=e.artifact_id JOIN scraping.sources s ON s.id=a.source_id
 WHERE p.security_id=$1 AND p.processor_version='collected-research-v1'
 AND p.destination='history' AND p.status='publisher_observation'
 AND s.enabled AND s.redistribution_allowed=true
 AND length(trim(s.config->>'permissionReference')) BETWEEN 1 AND 200
 AND a.storage_path LIKE 'r2://continua-financial-documents/%' AND a.sha256 ~ '^[a-f0-9]{64}$'
), observed AS (
 SELECT DISTINCT ON(${closeOnly ? 'r.date,l.source_id' : 'r.date'}) $1::text AS "securityId",'1d'::text AS interval,
 (r.date::date::timestamp AT TIME ZONE 'UTC') AS timestamp,${closeOnly ? 'NULL::numeric AS open,NULL::numeric AS high,NULL::numeric AS low' : 'r.open,r.high,r.low'},r.close,r.volume,
 l.document_url AS "sourceUrl",'publisher_observation'::text AS basis,'unknown'::text AS adjustment
 FROM latest l CROSS JOIN LATERAL jsonb_to_recordset(l.payload->'history')
 AS r(date text,open numeric,high numeric,low numeric,close numeric,volume numeric)
 WHERE $2='1d' AND r.date::date<=CURRENT_DATE
 AND r.date::date::timestamp AT TIME ZONE 'UTC' BETWEEN $3 AND $4
 ${closeOnly ? 'AND r.close>0 AND (r.volume IS NULL OR r.volume>=0)' : 'AND r.open>0 AND r.close>0 AND r.low>0 AND r.high>=greatest(r.open,r.close,r.low) AND r.low<=least(r.open,r.close) AND r.volume>=0'}
 ORDER BY r.date,${closeOnly ? 'l.source_id,' : ''}l.extracted_at DESC,l.id DESC
)
SELECT *,to_char(timestamp AT TIME ZONE 'UTC','YYYY-MM-DD') AS date FROM observed ORDER BY timestamp${closeOnly ? ' LIMIT 10001' : ''}`;}
export const publisherCandleQuery = publisherHistoryQuery();
export const publisherCloseQuery = publisherHistoryQuery(true);

export function mergeDailyObservations(canonical, observed) {
 const dates=new Set(canonical.map(r=>new Date(r.timestamp).toISOString().slice(0,10)));
 return [...canonical,...observed.filter(r=>!dates.has(new Date(r.timestamp).toISOString().slice(0,10)))].sort((a,b)=>new Date(a.timestamp)-new Date(b.timestamp));
}

// Legacy provider records contain observed closes only; never expose flat OHLC.
export const legacyProviderCloseQuery = `SELECT security_id AS "securityId",to_char(bar_time AT TIME ZONE 'UTC','YYYY-MM-DD') AS date,
            close,CASE WHEN source_url LIKE 'https://afx.kwayisi.org/nse/%' THEN volume ELSE NULL END AS volume,
            'unknown'::text AS adjustment,source_url AS "sourceUrl",'daily_close_only'::text AS basis,
            NULL::numeric AS open,NULL::numeric AS high,NULL::numeric AS low
            FROM market.candles WHERE security_id=$1 AND interval='1d' AND close>0
            AND bar_time >= ($2::date::timestamp AT TIME ZONE 'UTC')
            AND bar_time < (($3::date+1)::timestamp AT TIME ZONE 'UTC')
            AND source_url ~ '^https://(live[.]mystocks[.]co[.]ke/|afx[.]kwayisi[.]org/nse/)'
            ORDER BY bar_time LIMIT 10001`;
