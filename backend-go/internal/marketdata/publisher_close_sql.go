package marketdata

// Close-only observations retain source permissions and immutable R2 evidence gates.
const publisherCloseSQL = `WITH latest AS (
 SELECT p.payload,a.document_url,a.source_id,e.extracted_at,e.id FROM scraping.processed_research p
 JOIN scraping.extractions e ON e.id=p.extraction_id
 JOIN scraping.raw_artifacts a ON a.id=e.artifact_id JOIN scraping.sources s ON s.id=a.source_id
 WHERE p.security_id=$1 AND p.processor_version='collected-research-v1'
 AND p.destination='history' AND p.status='publisher_observation'
 AND s.enabled AND s.redistribution_allowed=true
 AND length(trim(s.config->>'permissionReference')) BETWEEN 1 AND 200
 AND a.storage_path LIKE 'r2://continua-financial-documents/%' AND a.sha256 ~ '^[a-f0-9]{64}$'
), observed AS (
 SELECT DISTINCT ON(r.date,l.source_id) $1::text AS "securityId",'1d'::text AS interval,
 (r.date::date::timestamp AT TIME ZONE 'UTC') AS timestamp,NULL::numeric AS open,NULL::numeric AS high,NULL::numeric AS low,r.close,r.volume,
 l.document_url AS "sourceUrl",'publisher_observation'::text AS basis,'unknown'::text AS adjustment
 FROM latest l CROSS JOIN LATERAL jsonb_to_recordset(l.payload->'history')
 AS r(date text,open numeric,high numeric,low numeric,close numeric,volume numeric)
 WHERE $2='1d' AND r.date::date<=CURRENT_DATE
 AND r.date::date::timestamp AT TIME ZONE 'UTC' BETWEEN $3 AND $4
 AND r.close>0 AND (r.volume IS NULL OR r.volume>=0)
 ORDER BY r.date,l.source_id,l.extracted_at DESC,l.id DESC
)
SELECT *,to_char(timestamp AT TIME ZONE 'UTC','YYYY-MM-DD') AS date FROM observed ORDER BY timestamp LIMIT 10001`

const legacyProviderCloseSQL = `SELECT security_id AS "securityId",to_char(bar_time AT TIME ZONE 'UTC','YYYY-MM-DD') AS date,
            close,CASE WHEN source_url LIKE 'https://afx.kwayisi.org/nse/%' THEN volume ELSE NULL END AS volume,
            'unknown'::text AS adjustment,source_url AS "sourceUrl",'daily_close_only'::text AS basis,
            NULL::numeric AS open,NULL::numeric AS high,NULL::numeric AS low
            FROM market.candles WHERE security_id=$1 AND interval='1d' AND close>0
            AND bar_time >= ($2::date::timestamp AT TIME ZONE 'UTC')
            AND bar_time < (($3::date+1)::timestamp AT TIME ZONE 'UTC')
            AND source_url ~ '^https://(live[.]mystocks[.]co[.]ke/|afx[.]kwayisi[.]org/nse/)'
            ORDER BY bar_time LIMIT 10001`
