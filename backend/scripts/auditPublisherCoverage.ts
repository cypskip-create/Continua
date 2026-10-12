/** Read-only production diagnostics; never prints credentials or user data. */
import {query,pool} from '../src/storage/db.js';
import {publisherFinancialTables} from '../src/services/research/publisherFinancialTables.js';
try {
  for(const [label,sql] of [
    ['publisher','SELECT id,enabled,redistribution_allowed FROM scraping.sources WHERE id=\'kenyanstocks\''],
    ['extractions',`SELECT count(*) AS count,max(extracted_at) AS newest FROM scraping.extractions e JOIN scraping.raw_artifacts a ON a.id=e.artifact_id WHERE a.source_id='kenyanstocks'`],
    ['jobs',`SELECT status,count(*) FROM scraping.document_jobs WHERE source_id='kenyanstocks' GROUP BY status`],
    ['candidates',`SELECT status,count(*) FROM market.financial_statement_candidates WHERE source='kenyanstocks' GROUP BY status`],
    ['validation',`SELECT outcome,reason,count(*) FROM market.document_validations WHERE source_url LIKE 'https://assets.kenyanstocks.com/%' GROUP BY outcome,reason ORDER BY count(*) DESC LIMIT 12`],
    ['recent reports',`SELECT a.title,e.id,e.method,e.needs_review FROM scraping.raw_artifacts a JOIN scraping.extractions e ON e.artifact_id=a.id WHERE a.source_id='kenyanstocks' AND a.content_type LIKE '%pdf%' ORDER BY e.id DESC LIMIT 6`],
    ['completed tabs',`SELECT document->'context'->>'tab' AS tab,count(*) FROM scraping.document_jobs WHERE source_id='kenyanstocks' AND status='complete' GROUP BY tab`],
    ['files views',`SELECT a.title,length(e.text) AS length,left(e.text,180) AS excerpt FROM scraping.raw_artifacts a JOIN scraping.extractions e ON e.artifact_id=a.id WHERE a.source_id='kenyanstocks' AND a.document_url LIKE '%tab=Files%' ORDER BY e.id DESC LIMIT 5`],
    ['PDF jobs',`SELECT status,count(*) FROM scraping.document_jobs WHERE source_id='kenyanstocks' AND url ~* '\\.pdf($|[?])' GROUP BY status`],
    ['failed jobs',`SELECT document->'context'->>'tab' AS tab,error_reason,count(*) FROM scraping.document_jobs WHERE source_id='kenyanstocks' AND status='failed' GROUP BY tab,error_reason LIMIT 8`],
  ]) {
    try { console.log(label,JSON.stringify((await query(sql!)).rows)); }
    catch(e) {console.log(label,'unavailable',(e as {code?:string}).code??'connection');}
  }
  console.log('COOP source-table presentation',JSON.stringify((await publisherFinancialTables('COOP')).map(t=>({category:t.category,years:t.columns.slice(1),rows:t.rows.length}))));
} finally {await pool.end();}
