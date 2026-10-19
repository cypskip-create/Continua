-- A blocked processing receipt is not prepared financial evidence.
BEGIN;
CREATE OR REPLACE FUNCTION public.company_processing_status(p_symbol text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET statement_timeout='5s'
AS $$ DECLARE result jsonb; target text; BEGIN
 IF p_symbol IS NULL OR p_symbol !~ '^[A-Z0-9.-]{1,20}$' THEN RAISE invalid_parameter_value USING MESSAGE='Invalid company symbol'; END IF;
 SELECT id INTO target FROM market.securities WHERE exchange='NSE' AND symbol=p_symbol AND status<>'delisted';
 IF target IS NULL THEN RETURN NULL; END IF;
 WITH related AS MATERIALIZED (
  SELECT e.artifact_id FROM scraping.extractions e
  WHERE CASE e.entity->>'ticker' WHEN 'DTK' THEN 'DTB' WHEN 'SBIC' THEN 'STANBIC' WHEN 'HFCK' THEN 'HFCB' ELSE e.entity->>'ticker' END=p_symbol
  UNION SELECT e.artifact_id FROM scraping.extractions e JOIN scraping.processed_research p ON p.extraction_id=e.id WHERE p.security_id=target
 ), artifacts AS MATERIALIZED (
  SELECT a.* FROM scraping.raw_artifacts a JOIN scraping.sources s ON s.id=a.source_id
  WHERE s.enabled AND s.redistribution_allowed=true
   AND length(trim(s.config->>'permissionReference')) BETWEEN 1 AND 200
   AND (a.id IN(SELECT artifact_id FROM related) OR
     CASE a.metadata->>'ticker' WHEN 'DTK' THEN 'DTB' WHEN 'SBIC' THEN 'STANBIC' WHEN 'HFCK' THEN 'HFCB' ELSE a.metadata->>'ticker' END=p_symbol)
 ), latest AS (
  SELECT DISTINCT ON(e.artifact_id) e.artifact_id,e.id,e.needs_review FROM scraping.extractions e JOIN artifacts a ON a.id=e.artifact_id
  ORDER BY e.artifact_id,e.extracted_at DESC,e.id DESC
 ), facts AS (
  SELECT a.id,a.storage_path,a.sha256,a.retrieved_at,l.id AS extraction_id,l.needs_review,
   p.status,p.processed_at,c.verified_at,
   (SELECT max(d.last_failed) FROM scraping.dead_letters d WHERE d.source_id=a.source_id AND d.url=a.document_url AND d.last_failed>coalesce(p.processed_at,'epoch'::timestamptz)) AS last_failure
  FROM artifacts a LEFT JOIN latest l ON l.artifact_id=a.id
  LEFT JOIN scraping.processed_research p ON p.extraction_id=l.id AND p.processor_version='collected-research-v1' AND p.security_id=target
  LEFT JOIN scraping.processed_cloud_archive c ON c.extraction_id=p.extraction_id AND c.processor_version=p.processor_version AND c.processed_at=p.processed_at
 ) SELECT jsonb_build_object('symbol',p_symbol,
  'collectedFiles',count(*),'archivedFiles',count(*) FILTER(WHERE storage_path LIKE 'r2://continua-financial-documents/%' AND sha256 ~ '^[a-f0-9]{64}$'),
  'awaitingExtraction',count(*) FILTER(WHERE extraction_id IS NULL),
  'awaitingProcessing',count(*) FILTER(WHERE extraction_id IS NOT NULL AND status IS NULL),
  'processedFiles',count(*) FILTER(WHERE status IN('publisher_observation','review_required','empty')),
  'preparedFiles',count(*) FILTER(WHERE verified_at IS NOT NULL AND status IN('publisher_observation','review_required','empty')),
  'awaitingReview',count(*) FILTER(WHERE status IN('review_required','blocked') OR status IS NULL AND needs_review),
  'failedFiles',count(*) FILTER(WHERE last_failure IS NOT NULL),
  'lastCollectedAt',max(retrieved_at),'lastProcessedAt',max(processed_at),'lastFailureAt',max(last_failure),
  'scope','Eligible discovered evidence only. Processing completion does not establish complete filing coverage or investment quality.') INTO result FROM facts;
 result=result||jsonb_build_object('state',CASE
  WHEN (result->>'collectedFiles')::int=0 THEN 'awaiting_collection'
  WHEN (result->>'archivedFiles')::int<(result->>'collectedFiles')::int THEN 'archive_pending'
  WHEN (result->>'failedFiles')::int>0 THEN 'retry_scheduled'
  WHEN (result->>'awaitingExtraction')::int>0 THEN 'extraction_pending'
  WHEN (result->>'awaitingProcessing')::int>0 THEN 'processing_pending'
  WHEN (result->>'awaitingReview')::int>0 THEN 'review_required'
  WHEN (result->>'preparedFiles')::int<(result->>'processedFiles')::int THEN 'preparing'
  ELSE 'processed' END);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.company_processing_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_processing_status(text) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
