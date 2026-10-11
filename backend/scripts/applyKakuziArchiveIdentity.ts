import {env} from '../src/config/index.js';
import pg from 'pg';
import {readFile} from 'node:fs/promises';
const version='20261011160000',name='kakuzi_archive_identity';
const sql=await readFile(new URL(`../../supabase/migrations/${version}_${name}.sql`,import.meta.url),'utf8');
const db=new pg.Client({connectionString:env.DATABASE_URL,connectionTimeoutMillis:10000,statement_timeout:30000});
let transaction=false;
let stage='connect';
try{
 await db.connect();stage='begin';await db.query('BEGIN');transaction=true;await db.query('SELECT pg_advisory_xact_lock(20261011,160000)');stage='migration';
 const existing=await db.query('SELECT version FROM supabase_migrations.schema_migrations WHERE version=$1',[version]);
 if(!existing.rowCount){await db.query(sql);await db.query('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES($1,$2,$3)',[version,name,[sql]]);}
 stage='identity';const identity=await db.query("SELECT s.id,c.name FROM market.securities s JOIN market.companies c ON c.id=s.company_id WHERE s.id='NSE:KUKZ' AND s.symbol='KUKZ' AND s.exchange='NSE' AND s.currency='KES' AND s.status='active' AND lower(c.name)='kakuzi plc'");
 if(identity.rowCount!==1){const check=await db.query("SELECT s.id,s.symbol,s.exchange,s.currency,s.status,c.name FROM market.securities s JOIN market.companies c ON c.id=s.company_id WHERE s.id='NSE:KUKZ'");console.log(JSON.stringify({identityCheck:check.rows}));throw new Error('Conflicting issuer identity requires review');}
 const apply=process.argv.includes('--apply');await db.query(apply?'COMMIT':'ROLLBACK');transaction=false;
 console.log(JSON.stringify({migration:version,applied:apply,alreadyApplied:!!existing.rowCount,validated:true}));
}catch(e){if(transaction)await db.query('ROLLBACK').catch(()=>{});console.log(JSON.stringify({applied:false,stage,errorCode:(e as {code?:string}).code??'identity_migration_failed'}));process.exitCode=1;}finally{await db.end().catch(()=>{});}
