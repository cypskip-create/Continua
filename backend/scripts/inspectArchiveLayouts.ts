/** Read-only public report inventory. --extraction shows public source text;
 * credentials and user data are never included. Latest validation per document. */
import {pool,query} from '../src/storage/db.js';
try {
 const target=process.argv.find(v=>v.startsWith('--extraction='))?.split('=')[1];
 if(target){if(!/^\d+$/.test(target))throw new Error('Numeric extraction ID required');console.log(JSON.stringify({report:(await query('SELECT e.id,a.document_url,e.text FROM scraping.extractions e JOIN scraping.raw_artifacts a ON a.id=e.artifact_id WHERE e.id=$1',[target])).rows,validation:(await query('SELECT outcome,reason FROM market.document_validations WHERE extraction_id=$1 ORDER BY validated_at DESC LIMIT 1',[target])).rows,issuers:(await query("SELECT s.id,c.name FROM market.securities s JOIN market.companies c ON c.id=s.company_id WHERE s.exchange='NSE' AND lower(c.name) LIKE '%kakuzi%'")).rows},null,2));}
 else {
 console.log(JSON.stringify({outcomes:(await query(`WITH latest AS (SELECT DISTINCT ON(extraction_id) outcome,reason FROM market.document_validations ORDER BY extraction_id,validated_at DESC) SELECT outcome,reason,count(*)::int AS count FROM latest GROUP BY outcome,reason ORDER BY count(*) DESC LIMIT 20`)).rows,
 reports:(await query(`SELECT e.id,e.method,a.title,a.document_url,length(e.text) AS characters,substring(e.text,1,300) AS masthead FROM scraping.extractions e JOIN scraping.raw_artifacts a ON a.id=e.artifact_id WHERE a.source_id='nse' AND e.method='native_pdf_text' AND (e.text ILIKE '%CONSOLIDATED STATEMENT%' OR a.title ~* 'equity|absa|kcb|annual|half.year') ORDER BY e.id DESC LIMIT 16`)).rows},null,2));
 }
}catch(e){console.error((e as Error).message);process.exitCode=1;}finally{await pool.end();}
