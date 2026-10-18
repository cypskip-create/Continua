// Disposable embedded PostgreSQL; never reads DATABASE_URL or R2 credentials.
// npm install --prefix .qa-artifacts/canonical-fixture --no-save @electric-sql/pglite@0.5.10
// node infra/migration/canonical-financial-fixture.mjs
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../../.qa-artifacts/canonical-fixture/package.json',import.meta.url));
const {PGlite}=require('@electric-sql/pglite');
const db=new PGlite();
const root=new URL('../../',import.meta.url);
let checks=0;
const check=(a,b)=>{assert.deepEqual(a,b);checks++};
try {
 await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
 for(const path of [
  'supabase/migrations/030_market_schema.sql',
  'supabase/migrations/031_production_readiness.sql',
  'scraper/migrations/20260827090000 scraping engine foundation schema.sql',
  'backend/migration/20260901090000 financial statement candidates bridge.sql',
  'supabase/migrations/20261010140000_filing_history_reviews.sql',
  'supabase/migrations/20261011123000_partial_reported_statements.sql',
  'scraper/migrations/20261016170000 processed research.sql',
  'supabase/migrations/20261018100000_canonical_financial_observations.sql',
 ]) await db.exec(await readFile(new URL(path,root),'utf8'));
 // Reapplying the additive migration must not damage or duplicate data.
 await db.exec(await readFile(new URL('supabase/migrations/20261018100000_canonical_financial_observations.sql',root),'utf8'));
 await db.query(`INSERT INTO scraping.sources(id,name,adapter,redistribution_allowed,config)
  VALUES('kenyanstocks','Fixture publisher','kenyanstocks',true,'{"permissionReference":"synthetic fixture only"}')`);
 const symbols=['CGEN','COOP','SCOM','KCB','BRIT','KUKZ'];
 for(const symbol of symbols){
  await db.query('INSERT INTO market.companies(id,name) VALUES($1,$2)',['company:'+symbol,'Fixture '+symbol]);
  await db.query(`INSERT INTO market.securities(id,symbol,exchange,company_id,currency,status)
   VALUES($1,$2,'NSE',$3,'KES','active')`,['NSE:'+symbol,symbol,'company:'+symbol]);
 }
 let serial=0;
 async function observe(symbol,category,values,destination='financials'){
  serial++;
  const hash=serial.toString(16).padStart(64,'0');
  const artifact=(await db.query(`INSERT INTO scraping.raw_artifacts(source_id,adapter,sha256,document_url,storage_path,crawler_version)
    VALUES('kenyanstocks','fixture',$1,$2,$3,'fixture') RETURNING id`,[hash,'https://fixture.invalid/'+serial,'r2://continua-financial-documents/'+hash])).rows[0].id;
  const extraction=(await db.query(`INSERT INTO scraping.extractions(artifact_id,method,parser_version,entity)
    VALUES($1,'html','fixture',$2::jsonb) RETURNING id`,[artifact,JSON.stringify({ticker:symbol})])).rows[0].id;
  const payload={destination,category,status:'publisher_observation',financialFields:values.map(([year,metric,value])=>({year,metric,value,raw:String(value)}))};
  await db.query(`INSERT INTO scraping.processed_research(extraction_id,processor_version,security_id,destination,status,payload)
    VALUES($1,'collected-research-v1',$2,$3,'publisher_observation',$4::jsonb)`,[extraction,'NSE:'+symbol,destination,JSON.stringify(payload)]);
  return {artifact,extraction};
 }
 async function history(symbol,kind='annual',limit=20,bypass=false){
  return (await db.query('SELECT payload FROM market.canonical_financial_history($1,$2,$3,$4) payload',['NSE:'+symbol,kind,limit,bypass])).rows.map(r=>r.payload);
 }
 const cgen=await observe('CGEN','Profit/Loss',[
  [2021,'revenue',10e9],[2022,'revenue',12e9],[2023,'revenue',18e9],
  [2024,'revenue',20.94e9],[2024,'netIncome',526.05e6],[2024,'eps',6.56]]);
 for(const symbol of symbols.slice(1))await observe(symbol,'Profit/Loss',[[2024,'revenue',100],[2024,'netIncome',10]]);
 await observe('COOP','Invalid values', [['tomorrow','revenue',1],[9999,'revenue',2],[2024,'revenue','bad'],[2024,'__proto__',77]]);
 check((await history('COOP'))[0].revenue,100);
 let rows=await history('CGEN');
 check(rows.length,4);check(rows.at(-1).revenue,20.94e9);check(rows.at(-1).netIncome,526.05e6);check(rows.at(-1).eps,6.56);
 check(rows.at(-1).reportedAt,null);check(rows.at(-1).periodEnd,null);check(rows.at(-1).currency,null);
 check(rows.at(-1).basis,'publisher_observation');check(rows.at(-1).calculationEligibility.pointInTime,false);
 check(rows.at(-1).metricEvidence.revenue.sources[0].contentHash.length,64);
 check((await history('CGEN','annual',1))[0],rows.at(-1));
 check(await history('CGEN','quarterly'),[]);check(await history('UNKNOWN'),[]);
 for(const symbol of symbols.slice(1))check((await history(symbol)).length,1);
 await observe('CGEN','Summary',[[2024,'revenue',21e9]],'overview');
 check((await history('CGEN')).at(-1).revenue,20.94e9);
 await observe('CGEN','Other',[[2024,'netIncome',527e6]]);
 rows=await history('CGEN');check(rows.at(-1).netIncome,null);check(rows.at(-1).qualityStatus,'conflicting');
 check(rows.at(-1).metricEvidence.netIncome.sources.length,2);
 // A revised report replaces its own older category, retaining other categories.
 await observe('CGEN','Other',[[2024,'netIncome',526.05e6]]);
 check((await history('CGEN')).at(-1).netIncome,526.05e6);
 // Permission revocation applies immediately even to already processed evidence.
 await db.exec("UPDATE scraping.sources SET redistribution_allowed=false");
 check(await history('CGEN'),[]);
 await db.exec("UPDATE scraping.sources SET redistribution_allowed=true");
 await db.query("UPDATE scraping.raw_artifacts SET storage_path='local/not-private' WHERE id=$1",[cgen.artifact]);
 check((await history('CGEN')).at(-1).eps,undefined);
 await db.query("UPDATE scraping.raw_artifacts SET storage_path='r2://continua-financial-documents/original' WHERE id=$1",[cgen.artifact]);
 // Validated components win; unreviewed changes must not leak through that review.
 await db.exec(`INSERT INTO market.financial_periods(id,security_id,period_type,fiscal_year,period_end,reported_at,currency)
   VALUES('fixture-period','NSE:CGEN','annual',2024,'2024-12-31','2025-03-01','KES');
   INSERT INTO market.income_statements(period_id,revenue,net_income,eps) VALUES('fixture-period',21000000000,530000000,6.60);`);
 check((await history('CGEN')).at(-1).eps,6.56);
 const candidate=(await db.query("INSERT INTO market.financial_statement_candidates(security_id,source,exchange,document_url,detected_table) VALUES('NSE:CGEN','fixture','NSE','https://fixture.invalid/report','{}') RETURNING id")).rows[0].id;
 await db.query(`INSERT INTO market.filing_history_reviews(candidate_id,period_id,column_index,statement_type,source_url,source_page,review_note,reviewed_values)
  VALUES($1,'fixture-period',0,'income','https://fixture.invalid/report',1,'Synthetic review',$2::jsonb)`,[candidate,JSON.stringify({periodId:'fixture-period',revenue:21e9,netIncome:530e6,eps:6.60})]);
 rows=await history('CGEN');check(rows.length,4);check(rows.at(-1).eps,6.60);check(rows.at(-1).qualityStatus,'reviewed');
 await db.exec("UPDATE market.income_statements SET eps=999 WHERE period_id='fixture-period'");
 check((await history('CGEN')).at(-1).eps,6.56);
 await db.exec("UPDATE market.financial_periods SET reported_at=current_date+1 WHERE id='fixture-period'");
 check((await history('CGEN')).at(-1).reportedAt,null);
 const cli=await readFile(new URL('scraper-python/research_status.py',root),'utf8');
 let param=0;
 const coverageSQL=cli.match(/COVERAGE_SQL="""([\s\S]*?)"""/)[1].replaceAll('%%','%').replace(/%s/g,()=>'$'+(++param));
 const coverage=(await db.query(coverageSQL,[null,null])).rows;
 check(coverage.length,6);check(coverage.find(r=>r.symbol==='CGEN').periods,4);
 check((await db.query(coverageSQL,['COOP','COOP'])).rows.length,1);
 const access=(await db.query(`SELECT has_function_privilege('anon','market.canonical_financial_history(text,text,integer,boolean)','EXECUTE') AS public,
  has_function_privilege('authenticated','market.publisher_financial_history(text)','EXECUTE') AS user`)).rows[0];
 check(access,{public:false,user:false});
 console.log(JSON.stringify({checks,fixtureCompanies:symbols.length,productionCompaniesProcessed:0,status:'passed'}));
} catch(error) { console.error(error.message); process.exitCode=1; } finally {await db.close()}
