/** Operator-reviewed repair of the visually verified official SCOM statement.
 * Dry run by default. Old future-dated bundles are archived, never discarded.
 * No current valid filing can be replaced by this command. */
import {pool,query,withTransaction} from '../src/storage/db.js';
import {validateCondensedGroupReport} from '../src/ingestion/normalizers/condensedGroupReport.js';
import {financialStatementCandidatesRepository} from '../src/storage/repositories/financialStatementCandidatesRepository.js';
import {confirmHistoricalColumns} from '../src/ingestion/confirmHistoricalColumns.js';
import {pricesRepository} from '../src/storage/repositories/pricesRepository.js';
import {researchService} from '../src/services/research/researchService.js';
try {
 const row=(await query(`SELECT e.id,e.artifact_id,e.text,a.document_url,a.title,a.source_id FROM scraping.extractions e JOIN scraping.raw_artifacts a ON a.id=e.artifact_id WHERE e.id=136 AND e.method='native_pdf_text' AND a.source_id='nse' AND a.sha256 ~ '^[a-f0-9]{64}$'`)).rows[0];
 if(!row || new URL(row.document_url).hostname!=='www.nse.co.ke')throw new Error('Reviewed official source is unavailable');
 const entries=validateCondensedGroupReport(row.text,'Safaricom Plc','NSE:SCOM');
 const apply=process.argv.includes('--apply');
 console.log(JSON.stringify({apply,sourceUrl:row.document_url,statements:entries.map(e=>({type:e.confirmation.statementType,years:e.confirmation.periods.map(p=>p.period.fiscalYear)}))}));
 if(apply) {
  const security=(await query("SELECT company_id FROM market.securities WHERE id='NSE:SCOM'")).rows[0];
  const candidates=[];
  for(const [index,entry] of entries.entries()) {
   await financialStatementCandidatesRepository.upsert({companyId:security.company_id,securityId:'NSE:SCOM',rawCompanyName:'Safaricom Plc',source:row.source_id,exchange:'NSE',documentUrl:row.document_url,documentTitle:row.title,tableIndex:100000+index,detectedTable:entry.table,detectionConfidence:1,scrapedArtifactId:row.artifact_id,scrapedExtractionId:row.id});
   candidates.push((await query('SELECT id,status FROM market.financial_statement_candidates WHERE scraped_extraction_id=$1 AND table_index=$2',[row.id,100000+index])).rows[0]);
  }
  await withTransaction(async db=>{
   const legacy=(await db.query(`SELECT p.*,row_to_json(i) AS income,row_to_json(b) AS balance,row_to_json(c) AS cashflow FROM market.financial_periods p LEFT JOIN market.income_statements i ON i.period_id=p.id LEFT JOIN market.balance_sheets b ON b.period_id=p.id LEFT JOIN market.cash_flow_statements c ON c.period_id=p.id WHERE p.id='NSE:period:SCOM:2026' AND (p.period_end>CURRENT_DATE OR p.reported_at>CURRENT_DATE) FOR UPDATE OF p`)).rows[0];
   if(legacy) {
    await db.query(`INSERT INTO market.invalid_filing_archive(period_id,reason,original_bundle,replacement_source_url) VALUES($1,$2,$3,$4) ON CONFLICT(period_id) DO NOTHING`,[legacy.id,'Future-dated legacy financial bundle; replaced from visually reviewed audited group statements',JSON.stringify(legacy),row.document_url]);
    // Statements and period remain in place until explicit reviewed replacement.
    await db.query('UPDATE market.financial_periods SET period_end=$2,reported_at=$3 WHERE id=$1',[legacy.id,'2026-03-31','2026-05-06']);
   }
  const archived=(await db.query("SELECT 1 FROM market.invalid_filing_archive WHERE period_id='NSE:period:SCOM:2026' AND replacement_source_url=$1",[row.document_url])).rowCount;
  for(const [index,entry] of entries.entries()) {
   const candidate=candidates[index]!;
   if(candidate.status==='confirmed')continue;
   entry.confirmation.periods.forEach(p=>{if(p.period.fiscalYear===2026 && archived)p.allowRestatement=true;});
   await confirmHistoricalColumns(candidate.id,entry.confirmation,db);
  }
  });
  const quote=await pricesRepository.getQuote('NSE:SCOM');
  if(quote)await researchService.recomputeAndStore('NSE:SCOM',quote.lastPrice);
  console.log(JSON.stringify({published:true,years:[2025,2026],sourceUrl:row.document_url}));
 }
}catch(e){console.error((e as Error).message);process.exitCode=1;}finally{await pool.end();}
