// Disposable embedded PostgreSQL; never reads DATABASE_URL or R2 credentials.
// npm install --prefix .qa-artifacts/canonical-fixture --no-save @electric-sql/pglite@0.5.10
// node infra/migration/canonical-financial-fixture.mjs
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const require=createRequire(new URL('../../.qa-artifacts/canonical-fixture/package.json',import.meta.url));
const {PGlite}=require('@electric-sql/pglite');
const db=new PGlite();
const root=new URL('../../',import.meta.url);
let checks=0;
const check=(a,b)=>{assert.deepEqual(a,b);checks++};
try {
 await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
 await db.exec('CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean); CREATE TABLE storage.objects(id integer PRIMARY KEY,bucket_id text,name text);');
 for(const path of [
  'supabase/migrations/030_market_schema.sql',
  'supabase/migrations/031_production_readiness.sql',
  'supabase/migrations/20261011211500_candle_provenance.sql',
  'scraper/migrations/20260827090000 scraping engine foundation schema.sql',
  'supabase/migrations/20261007210000_market_research_records.sql',
  'supabase/migrations/20261010220000_historical_document_queue.sql',
  'backend/migration/20260901090000 financial statement candidates bridge.sql',
  'supabase/migrations/20261010140000_filing_history_reviews.sql',
  'supabase/migrations/20261011123000_partial_reported_statements.sql',
  'scraper/migrations/20261016170000 processed research.sql',
  'scraper/migrations/20261018120000 processed cloud archive.sql',
  'scraper/migrations/20261019100000 uncatalogued raw archive.sql',
  'supabase/migrations/20261018100000_canonical_financial_observations.sql',
  'supabase/migrations/20261018200000_c_score_evidence.sql',
  'supabase/migrations/20261019123000_company_processing_status.sql',
  'supabase/migrations/20261019133000_processing_receipt_counts.sql',
 ]) await db.exec(await readFile(new URL(path,root),'utf8'));

 await db.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE TABLE public.portfolios(user_id uuid,symbol text,shares numeric);
 CREATE TABLE public.watchlists(user_id uuid,symbol text);
 CREATE TABLE public.engine_preferences(user_id uuid,settings jsonb);
 CREATE TABLE public.notifications(id serial,user_id uuid,type text,feature text,title text,message text,action_url text,entity_type text);
 CREATE FUNCTION public.effective_subscription_plan(uuid) RETURNS text LANGUAGE sql AS 'SELECT ''premium_plus''::text';`);
 const migration=await readFile(new URL('supabase/migrations/20261021150000_investment_evidence.sql',root),'utf8');
 await db.exec(migration);await db.exec(migration);
 const historyIdentity=await readFile(new URL('supabase/migrations/20261021200000_investment_history_identity.sql',root),'utf8');
 await db.exec(historyIdentity);await db.exec(historyIdentity);
 for(const table of ['investment_observations','investment_simulations','investment_event_preferences','investment_event_deliveries']) {
  check((await db.query("SELECT has_table_privilege('authenticated',$1,'SELECT') AS allowed",['market.'+table])).rows[0].allowed,false);
 }
 await db.query(`INSERT INTO scraping.sources(id,name,adapter,redistribution_allowed,config)
 VALUES('fixture','Fixture official data','worldbank',true,'{"permissionReference":"synthetic test only"}')`);
 const artifact=(await db.query(`INSERT INTO scraping.raw_artifacts(source_id,adapter,sha256,document_url,storage_path,crawler_version)
 VALUES('fixture','worldbank',$1,'https://fixture.invalid/report','r2://continua-financial-documents/fixture','fixture') RETURNING id`,['a'.repeat(64)])).rows[0].id;
 await db.query(`INSERT INTO market.investment_observations(id,kind,natural_key,observed_date,available_date,artifact_id,payload,parser_version,verification,verified_at)
 VALUES('old','macro','gdp','2024-12-31','2025-03-01',$1,'{"series":"gdp","value":4,"unit":"percent","frequency":"annual"}','fixture','verified',now()),
 ('revised','macro','gdp','2024-12-31','2026-03-01',$1,'{"series":"gdp","value":5,"unit":"percent","frequency":"annual"}','fixture','verified',now()),
 ('pending','macro','gdp','2024-12-31','2025-02-01',$1,'{}','fixture','pending',NULL)`,[artifact]);
 check((await db.query("SELECT id FROM market.investment_evidence WHERE available_date<='2025-12-31' ORDER BY id")).rows.map(r=>r.id),['old']);
 await db.query("UPDATE scraping.sources SET redistribution_allowed=false WHERE id='fixture'");
 check((await db.query('SELECT count(*)::integer AS n FROM market.investment_evidence')).rows[0].n,0);
 await db.query("UPDATE scraping.sources SET redistribution_allowed=true WHERE id='fixture'");
 const owner='11111111-1111-4111-8111-111111111111';
 await db.query('INSERT INTO auth.users VALUES($1)',[owner]);
 await db.query("INSERT INTO market.investment_event_preferences(user_id,enabled,macro,enabled_at) VALUES($1,true,true,now()-interval '1 day')",[owner]);
 await db.query(`INSERT INTO market.investment_observations(id,kind,natural_key,observed_date,available_date,artifact_id,payload,parser_version,verification,verified_at)
 VALUES('event','event','policy',CURRENT_DATE,CURRENT_DATE,$1,'{"type":"policy","title":"Synthetic fixture policy event"}','fixture','verified',now())`,[artifact]);
 check((await db.query('SELECT market.deliver_investment_events($1) AS n',[owner])).rows[0].n,1);
 check((await db.query('SELECT market.deliver_investment_events($1) AS n',[owner])).rows[0].n,0);
 await db.query("INSERT INTO public.engine_preferences VALUES($1,'{\"notifications\":false}')",[owner]);
 await db.query(`INSERT INTO market.investment_observations(id,kind,natural_key,observed_date,available_date,artifact_id,payload,parser_version,verification,verified_at)
 VALUES('event2','event','policy2',CURRENT_DATE,CURRENT_DATE,$1,'{"type":"policy"}','fixture','verified',now())`,[artifact]);
 check((await db.query('SELECT market.deliver_investment_events($1) AS n',[owner])).rows[0].n,0);
 await assert.rejects(db.query("UPDATE market.investment_observations SET payload='{}' WHERE id='old'"),/immutable/);checks++;
 await db.query("INSERT INTO market.companies(id,name) VALUES('fixture-company','Synthetic fixture only')");
 await db.query("INSERT INTO market.securities(id,symbol,exchange,company_id,currency,status,listed_at) VALUES('NSE:FIXTURE','FIXTURE','NSE','fixture-company','KES','delisted','2020-01-01')");
 const coverage=(await db.query('SELECT payload FROM market.investment_coverage_rows() payload')).rows[0].payload;
 check(coverage.status,'delisted');check(coverage.sourceLinkedCloses,0);check(coverage.annualPeriods,0);
 for(let i=0;i<25;i++)check((await db.query("SELECT market.save_investment_simulation($1,$2,'optimization',$3,'{}','{}') AS receipt",[owner,'Fixture '+i,'a'.repeat(64)])).rows[0].receipt.name,'Fixture '+i);
 check((await db.query("SELECT market.save_investment_simulation($1,'Over limit','optimization',$2,'{}','{}') AS receipt",[owner,'a'.repeat(64)])).rows[0].receipt,null);
 const privateID=(await db.query('SELECT id FROM market.investment_simulations WHERE user_id=$1 LIMIT 1',[owner])).rows[0].id;
 check((await db.query('SELECT count(*)::integer AS n FROM market.investment_simulations WHERE user_id=$1 AND id=$2',['22222222-2222-4222-8222-222222222222',privateID])).rows[0].n,0);
 const capture=spawnSync(process.env.NATIVE_PYTHON_BIN||(process.platform==='win32'?'python':'python3'),['-c',`
import asyncio,json,sys
sys.path.insert(0,'scraper-python')
from continua_scraper.investment import publish_investment_evidence
class DB:
 def __init__(self):self.calls=[]
 async def query(self,sql,params=()):self.calls.append({'sql':sql,'params':params});return []
db=DB();asyncio.run(publish_investment_evidence(db));print(json.dumps(db.calls))
`],{encoding:'utf8',cwd:new URL('../../',import.meta.url),windowsHide:true});
 assert.equal(capture.status,0,capture.stderr);
 const statements=JSON.parse(capture.stdout);
 await db.query("INSERT INTO market.financial_periods(id,security_id,period_type,fiscal_year,period_end,reported_at,currency) VALUES('fixture-period','NSE:FIXTURE','annual',2024,'2024-12-31','2025-04-01','KES')");
 const candidate=(await db.query(`INSERT INTO market.financial_statement_candidates(security_id,source,exchange,document_url,detected_table,scraped_artifact_id,status)
 VALUES('NSE:FIXTURE','fixture','NSE','https://fixture.invalid/report','{}',$1,'confirmed') RETURNING id`,[artifact])).rows[0].id;
 await db.query("INSERT INTO market.filing_history_reviews(candidate_id,period_id,column_index,statement_type,source_url,source_page,review_note,reviewed_values) VALUES($1,'fixture-period',0,'income','https://fixture.invalid/report',1,'Synthetic fixture only','{}')",[candidate]);
 for(const statement of statements){let parameter=0;const sql=statement.sql.replace(/%s/g,()=>'$'+(++parameter)).replaceAll('%%','%');await db.query(sql,statement.params);checks++;}
 check((await db.query("SELECT count(*)::integer AS n FROM market.investment_observations WHERE natural_key='report:fixture-period'")).rows[0].n,1);
 const historyCapture=spawnSync(process.env.NATIVE_PYTHON_BIN||(process.platform==='win32'?'python':'python3'),['-c',`
import asyncio,json,sys
from datetime import datetime,timezone
sys.path.insert(0,'scraper-python')
from continua_scraper.investment import _publish_artifact
class DB:
 def __init__(self):self.calls=[]
 async def query(self,sql,params=()):self.calls.append({'sql':sql,'params':params});return [{'id':'fixture'}]
rows=[{'kind':'macro','naturalKey':'history-fixture','date':str(year)+'-12-31','payload':{'series':'history-fixture','value':year}} for year in (2023,2024)]
db=DB();asyncio.run(_publish_artifact(db,{'artifact_id':int(sys.argv[1]),'retrieved_at':datetime(2026,10,21,tzinfo=timezone.utc),'parser_version':'history-fixture-v1','tables':[{'kind':'investment_observations','observations':rows}]}));print(json.dumps(db.calls))
`,String(artifact)],{encoding:'utf8',cwd:new URL('../../',import.meta.url),windowsHide:true});
 assert.equal(historyCapture.status,0,historyCapture.stderr);
 for(const statement of JSON.parse(historyCapture.stdout)){let parameter=0;const sql=statement.sql.replace(/%s/g,()=>'$'+(++parameter)).replaceAll('%%','%');await db.query(sql,statement.params);checks++;await db.query(sql,statement.params);}
 check((await db.query("SELECT count(*)::integer AS n FROM market.investment_observations WHERE natural_key='history-fixture'")).rows[0].n,2);
 await db.query(`UPDATE scraping.sources SET config=config || '{"investmentPublicationApproved":true}'::jsonb WHERE id='fixture'`);
 await db.query(`INSERT INTO scraping.extractions(artifact_id,method,parser_version,tables) VALUES($1,'html','history-fixture-v1',$2::jsonb)`,[artifact,JSON.stringify([{kind:'investment_observations',observations:[{date:'2023-12-31'},{date:'2024-12-31'}]}])]);
 let parameter=0;const pendingSQL=statements[0].sql.replace(/%s/g,()=>'$'+(++parameter)).replaceAll('%%','%');
 check((await db.query(pendingSQL,['history-fixture-v1',10])).rows.length,0);
 await db.query("DELETE FROM market.investment_observations WHERE parser_version='history-fixture-v1' AND observed_date='2023-12-31'");
 check((await db.query(pendingSQL,['history-fixture-v1',10])).rows.length,1);
 await db.exec(await readFile(new URL('supabase/migrations/20261022010000_institutional_governance.sql',root),'utf8'));
 await db.exec(await readFile(new URL('supabase/migrations/20261022010000_institutional_governance.sql',root),'utf8'));
 for(const table of ['quantitative_models','quantitative_runs','quantitative_snapshots','quantitative_datasets','exposure_relationships'])check((await db.query("SELECT has_table_privilege('authenticated',$1,'SELECT') allowed",['market.'+table])).rows[0].allowed,false);
 check((await db.query('SELECT count(*)::integer n FROM market.quantitative_models')).rows[0].n,10);
 check((await db.query('SELECT count(*)::integer n FROM market.quantitative_dashboard()')).rows[0].n,10);
 const modelVersion='institutional-intelligence-v1';
 await db.query("SELECT market.record_quantitative_run($1,'monte-carlo',$2,$3,'success',$4::jsonb,12)",[owner,modelVersion,'b'.repeat(64),JSON.stringify({validationStatus:'hypothetical',numericalReconciliation:0})]);
 await db.query("SELECT market.record_quantitative_run($1,'monte-carlo',$2,$3,'input-validation','{}',4)",[owner,modelVersion,'b'.repeat(64)]);
 const dashboard=(await db.query("SELECT payload FROM market.quantitative_dashboard() payload WHERE payload->>'modelId'='monte-carlo'")).rows[0].payload;
 check(Number(dashboard.attempts),2);check(Number(dashboard.failures),1);check(Number(dashboard.failureAttempts),1);check(Number(dashboard.failureRate),.5);
 for(let i=0;i<10;i++){const hash=i.toString(16).padStart(64,'0');check((await db.query("SELECT market.save_quantitative_snapshot($1,$2,$3,$4::jsonb,$5::jsonb) saved",[owner,'Fixture '+i,hash,JSON.stringify({kind:'monte-carlo',seed:i,returns:[{date:'2024-01-01',values:[.01]}]}),JSON.stringify({governance:{inputHash:hash,dataHash:'f'.repeat(64)},fan:[]})])).rows[0].saved.name,'Fixture '+i);}
 check((await db.query("SELECT market.save_quantitative_snapshot($1,'duplicate',$2,'{}',$3::jsonb) saved",[owner,'0'.repeat(64),JSON.stringify({governance:{inputHash:'0'.repeat(64),dataHash:'f'.repeat(64)}})])).rows[0].saved.name,'Fixture 0');
 check((await db.query("SELECT market.save_quantitative_snapshot($1,'over-limit',$2,'{}',$3::jsonb) saved",[owner,'e'.repeat(64),JSON.stringify({governance:{inputHash:'e'.repeat(64),dataHash:'f'.repeat(64)}})])).rows[0].saved,null);
 check((await db.query('SELECT count(*)::integer n FROM market.quantitative_datasets WHERE user_id=$1',[owner])).rows[0].n,1);
 const reconstructed=(await db.query('SELECT s.configuration||d.payload config FROM market.quantitative_snapshots s JOIN market.quantitative_datasets d USING(user_id,data_hash) WHERE s.user_id=$1 AND s.input_hash=$2',[owner,'0'.repeat(64)])).rows[0].config;
 check(reconstructed.seed,0);check(reconstructed.returns,[{date:'2024-01-01',values:[.01]}]);
 check((await db.query('SELECT market.delete_quantitative_snapshot($1,$2) removed',['22222222-2222-4222-8222-222222222222','0'.repeat(64)])).rows[0].removed,null);
 for(let i=0;i<10;i++)await db.query('SELECT market.delete_quantitative_snapshot($1,$2)',[owner,i.toString(16).padStart(64,'0')]);
 check((await db.query('SELECT count(*)::integer n FROM market.quantitative_datasets WHERE user_id=$1',[owner])).rows[0].n,0);
 check((await db.query('SELECT count(*)::integer n FROM market.quantitative_snapshots WHERE user_id=$1',['22222222-2222-4222-8222-222222222222'])).rows[0].n,0);
 await db.query(`INSERT INTO market.exposure_relationships(id,from_entity,to_entity,from_type,to_type,relation_type,effective_date,available_date,ownership_percent,artifact_id,parser_version,source_cell) VALUES('edge','shareholder:documented-id','security:NSE:FIXTURE','shareholder','security','owns','2024-12-31','2025-03-01',25,$1,'fixture','{"row":1}')`,[artifact]);
 check((await db.query("SELECT count(*)::integer n FROM market.institutional_graph_rows('2026-10-21','FIXTURE')")).rows[0].n,0);
 await assert.rejects(db.query("UPDATE market.exposure_relationships SET verification='verified' WHERE id='edge'"));checks++;
 await db.query("UPDATE market.exposure_relationships SET verification='verified',reviewed_at=now(),review_note='Source and identifiers checked in synthetic fixture' WHERE id='edge'");
 check((await db.query("SELECT count(*)::integer n FROM market.institutional_graph_rows('2026-10-21','FIXTURE')")).rows[0].n,1);
 check((await db.query("SELECT count(*)::integer n FROM market.institutional_graph_rows('2025-02-01','FIXTURE')")).rows[0].n,0);
 await db.query("UPDATE scraping.sources SET redistribution_allowed=false WHERE id='fixture'");
 check((await db.query("SELECT count(*)::integer n FROM market.institutional_graph_rows('2026-10-21','FIXTURE')")).rows[0].n,0);
 await assert.rejects(db.query("UPDATE market.exposure_relationships SET ownership_percent=30 WHERE id='edge'"),/immutable/);checks++;
 await assert.rejects(db.query(`INSERT INTO market.exposure_relationships(id,from_entity,to_entity,from_type,to_type,relation_type,effective_date,available_date,ownership_percent,artifact_id,parser_version,source_cell) VALUES('invalid','A','B','company','company','owns','2024-12-31','2025-03-01',101,$1,'fixture','{}')`,[artifact]));checks++;
 console.log(JSON.stringify({fixture:'Phase 2 and Phase 3 governance, private snapshots, source revocation, reviewed relationship graph, RLS and model receipts',checks,productionAccess:false}));
} finally {await db.close();}
