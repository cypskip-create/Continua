-- Additive read model. Requires scraper/migrations/20261016170000 processed research.sql.
-- No source payload, reviewed statement or production financial value is rewritten.
BEGIN;

CREATE OR REPLACE FUNCTION market.publisher_financial_history(target_security text)
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, market, scraping AS $function$
WITH latest AS MATERIALIZED (
  SELECT DISTINCT ON (p.destination, coalesce(p.payload->>'category',''))
    p.payload, p.destination, p.processor_version, e.id AS extraction_id,
    a.source_id, a.document_url, a.retrieved_at, a.sha256
  FROM scraping.processed_research p
  JOIN scraping.extractions e ON e.id=p.extraction_id
  JOIN scraping.raw_artifacts a ON a.id=e.artifact_id
  JOIN scraping.sources s ON s.id=a.source_id
  JOIN market.securities sec ON sec.id=p.security_id
  WHERE p.security_id=target_security AND sec.exchange='NSE'
    AND p.processor_version='collected-research-v1'
    AND p.destination IN ('financials','overview') AND p.status='publisher_observation'
    AND s.enabled AND s.redistribution_allowed=true
    AND length(trim(s.config->>'permissionReference')) BETWEEN 1 AND 200
    AND a.storage_path LIKE 'r2://continua-financial-documents/%'
    AND a.sha256 ~ '^[a-f0-9]{64}$'
    AND a.document_url LIKE 'https://%' AND a.retrieved_at<=now()
  ORDER BY p.destination, coalesce(p.payload->>'category',''), e.extracted_at DESC,e.id DESC
), fields AS (
  SELECT f->>'year' AS year, f->>'metric' AS metric, f->'value' AS value,
    CASE WHEN destination='financials' THEN 2 ELSE 1 END AS priority,
    jsonb_build_object('source',source_id,'sourceUrl',document_url,'retrievedAt',retrieved_at,
      'contentHash',sha256,'extractionId',extraction_id,'processingVersion',processor_version,
      'raw',f->'raw','sourceLabel',f->'sourceLabel','unit',coalesce(f->>'unit','unspecified'),
      'currency',f->'currency','qualityStatus','third_party_mapped') AS evidence
  FROM latest CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(payload->'financialFields')='array' THEN payload->'financialFields' ELSE '[]'::jsonb END) f
  WHERE jsonb_typeof(f->'year')='number' AND f->>'year' ~ '^20[0-9]{2}$'
    AND CASE WHEN f->>'year' ~ '^20[0-9]{2}$' THEN (f->>'year')::integer END<=extract(year FROM current_date)
    AND jsonb_typeof(f->'value')='number'
    AND abs(CASE WHEN jsonb_typeof(f->'value')='number' THEN (f->>'value')::numeric END)<=1e18
    AND f->>'metric' IN ('revenue','costOfRevenue','grossProfit','operatingExpenses',
      'operatingIncome','netIncome','eps','dilutedEps','ebitda','totalAssets',
      'totalLiabilities','totalEquity','cash','totalDebt','currentAssets',
      'currentLiabilities','sharesOutstanding','operatingCashFlow','investingCashFlow',
      'financingCashFlow','freeCashFlow','capex')
), ranked AS (
  SELECT *,max(priority) OVER(PARTITION BY year,metric) AS best_priority FROM fields
), reconciled AS (
  SELECT year,metric,
    CASE WHEN count(DISTINCT value)=1 THEN (jsonb_agg(value)->0) ELSE 'null'::jsonb END AS value,
    count(DISTINCT value)>1 AS conflict,jsonb_agg(DISTINCT evidence) AS evidence
  FROM ranked WHERE priority=best_priority GROUP BY year,metric
)
SELECT jsonb_object_agg(metric,value) || jsonb_build_object(
  'securityId',target_security,'fiscalYear',year::integer,'fiscalQuarter',NULL,
  'periodType','annual','periodEnd',NULL,'reportedAt',NULL,'currency',NULL,
  'basis','publisher_observation','qualityStatus',CASE WHEN bool_or(conflict) THEN 'conflicting' ELSE 'third_party_mapped' END,
  'processingVersion','canonical-financials-v1',
  'sourceUrls',(SELECT jsonb_agg(DISTINCT ev->>'sourceUrl') FROM reconciled r2
    CROSS JOIN LATERAL jsonb_array_elements(r2.evidence) ev WHERE r2.year=r.year),
  'metricEvidence',jsonb_object_agg(metric,jsonb_build_object('conflicting',conflict,'sources',evidence)),
  'calculationEligibility',jsonb_build_object('historicalObservation',true,'pointInTime',false,
    'reason','Third-party annual observation. Fiscal year end, filing date and currency are not inferred; dated valuation and backtests require stronger evidence.'))
FROM reconciled r GROUP BY year ORDER BY year::integer;
$function$;

-- Private service read model: never expose scraping data through public RPC.
REVOKE ALL ON FUNCTION market.publisher_financial_history(text) FROM PUBLIC,anon,authenticated;

-- One service-side history for cards, expanded details and Engine. Reviewed
-- periods win over publisher periods; no observation is promoted to a filing.
CREATE OR REPLACE FUNCTION market.canonical_financial_history(
  target_security text, target_type text, max_periods integer, allow_unreviewed boolean DEFAULT false)
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, market, scraping AS $canonical$
WITH reviewed AS MATERIALIZED (
 SELECT jsonb_build_object('periodId',p.id,'securityId',p.security_id,
   'periodType',p.period_type,'fiscalYear',p.fiscal_year,'fiscalQuarter',p.fiscal_quarter,
   'periodEnd',p.period_end,'reportedAt',p.reported_at,'currency',p.currency,
   'sourceUrls',coalesce((SELECT jsonb_agg(DISTINCT r.source_url)
      FROM market.filing_history_reviews r WHERE r.period_id=p.id),'[]'::jsonb),
   'processingVersion','canonical-financials-v1',
   'qualityStatus',CASE WHEN allow_unreviewed THEN 'unreviewed' ELSE 'reviewed' END,
   'revenue',i.revenue,'costOfRevenue',i.cost_of_revenue,'grossProfit',i.gross_profit,'operatingExpenses',i.operating_expenses,'operatingIncome',i.operating_income,'netIncome',i.net_income,'eps',i.eps,'dilutedEps',i.diluted_eps,'ebitda',i.ebitda,'totalAssets',b.total_assets,'totalLiabilities',b.total_liabilities,'totalEquity',b.total_equity,'cash',b.cash,'totalDebt',b.total_debt,'currentAssets',b.current_assets,'currentLiabilities',b.current_liabilities,'sharesOutstanding',b.shares_outstanding,'operatingCashFlow',c.operating_cash_flow,'investingCashFlow',c.investing_cash_flow,'financingCashFlow',c.financing_cash_flow,'freeCashFlow',c.free_cash_flow,'capex',c.capex) AS payload
 FROM market.financial_periods p
 LEFT JOIN market.income_statements i ON i.period_id=p.id AND
      (allow_unreviewed OR jsonb_build_object('revenue',i.revenue,'costOfRevenue',i.cost_of_revenue,'grossProfit',i.gross_profit,'operatingExpenses',i.operating_expenses,'operatingIncome',i.operating_income,'netIncome',i.net_income,'eps',i.eps,'dilutedEps',i.diluted_eps,'ebitda',i.ebitda) =
        (SELECT CASE WHEN jsonb_typeof(r.reviewed_values)='object'
          AND (r.reviewed_values->>'periodId' IS NULL OR r.reviewed_values->>'periodId'=p.id)
          THEN jsonb_build_object('revenue',NULL,'costOfRevenue',NULL,'grossProfit',NULL,'operatingExpenses',NULL,'operatingIncome',NULL,'netIncome',NULL,'eps',NULL,'dilutedEps',NULL,'ebitda',NULL) || (r.reviewed_values-'periodId') END
         FROM market.filing_history_reviews r WHERE r.period_id=p.id AND r.statement_type='income'
         ORDER BY r.id DESC LIMIT 1))
 LEFT JOIN market.balance_sheets b ON b.period_id=p.id AND
      (allow_unreviewed OR jsonb_build_object('totalAssets',b.total_assets,'totalLiabilities',b.total_liabilities,'totalEquity',b.total_equity,'cash',b.cash,'totalDebt',b.total_debt,'currentAssets',b.current_assets,'currentLiabilities',b.current_liabilities,'sharesOutstanding',b.shares_outstanding) =
        (SELECT CASE WHEN jsonb_typeof(r.reviewed_values)='object'
          AND (r.reviewed_values->>'periodId' IS NULL OR r.reviewed_values->>'periodId'=p.id)
          THEN jsonb_build_object('totalAssets',NULL,'totalLiabilities',NULL,'totalEquity',NULL,'cash',NULL,'totalDebt',NULL,'currentAssets',NULL,'currentLiabilities',NULL,'sharesOutstanding',NULL) || (r.reviewed_values-'periodId') END
         FROM market.filing_history_reviews r WHERE r.period_id=p.id AND r.statement_type='balance'
         ORDER BY r.id DESC LIMIT 1))
 LEFT JOIN market.cash_flow_statements c ON c.period_id=p.id AND
      (allow_unreviewed OR jsonb_build_object('operatingCashFlow',c.operating_cash_flow,'investingCashFlow',c.investing_cash_flow,'financingCashFlow',c.financing_cash_flow,'freeCashFlow',c.free_cash_flow,'capex',c.capex) =
        (SELECT CASE WHEN jsonb_typeof(r.reviewed_values)='object'
          AND (r.reviewed_values->>'periodId' IS NULL OR r.reviewed_values->>'periodId'=p.id)
          THEN jsonb_build_object('operatingCashFlow',NULL,'investingCashFlow',NULL,'financingCashFlow',NULL,'freeCashFlow',NULL,'capex',NULL) || (r.reviewed_values-'periodId') END
         FROM market.filing_history_reviews r WHERE r.period_id=p.id AND r.statement_type='cashflow'
         ORDER BY r.id DESC LIMIT 1))
 WHERE p.security_id=target_security AND p.period_type=target_type
   AND p.period_end<=current_date AND (p.reported_at IS NULL OR p.reported_at<=current_date)
   AND (allow_unreviewed OR EXISTS(SELECT 1 FROM market.filing_history_reviews r WHERE r.period_id=p.id))
   AND (i.period_id IS NOT NULL OR b.period_id IS NOT NULL OR c.period_id IS NOT NULL)
), candidates AS (
 SELECT payload FROM reviewed
 UNION ALL
 SELECT observation FROM market.publisher_financial_history(target_security) observation
 WHERE target_type='annual' AND NOT EXISTS(
   SELECT 1 FROM reviewed WHERE payload->'fiscalYear'=observation->'fiscalYear')
), selected AS (
 SELECT payload FROM candidates ORDER BY (payload->>'fiscalYear')::integer DESC,
   (payload->>'fiscalQuarter')::integer DESC NULLS FIRST
 LIMIT greatest(1,least(coalesce(max_periods,20),100))
)
SELECT payload || jsonb_build_object('ratios',jsonb_build_object(
  'netMargin',CASE WHEN (payload->>'revenue')::numeric>0 THEN (payload->>'netIncome')::numeric/(payload->>'revenue')::numeric END,
  'grossMargin',CASE WHEN (payload->>'revenue')::numeric>0 THEN (payload->>'grossProfit')::numeric/(payload->>'revenue')::numeric END,
  'operatingMargin',CASE WHEN (payload->>'revenue')::numeric>0 THEN (payload->>'operatingIncome')::numeric/(payload->>'revenue')::numeric END,
  'roe',CASE WHEN (payload->>'totalEquity')::numeric>0 THEN (payload->>'netIncome')::numeric/(payload->>'totalEquity')::numeric END,
  'roa',CASE WHEN (payload->>'totalAssets')::numeric>0 THEN (payload->>'netIncome')::numeric/(payload->>'totalAssets')::numeric END,
  'debtToEquity',CASE WHEN (payload->>'totalEquity')::numeric>0 THEN (payload->>'totalDebt')::numeric/(payload->>'totalEquity')::numeric END,
  'currentRatio',CASE WHEN (payload->>'currentLiabilities')::numeric>0 THEN (payload->>'currentAssets')::numeric/(payload->>'currentLiabilities')::numeric END
)) FROM selected ORDER BY (payload->>'fiscalYear')::integer,
  (payload->>'fiscalQuarter')::integer NULLS FIRST;
$canonical$;
REVOKE ALL ON FUNCTION market.canonical_financial_history(text,text,integer,boolean) FROM PUBLIC,anon,authenticated;

COMMIT;
