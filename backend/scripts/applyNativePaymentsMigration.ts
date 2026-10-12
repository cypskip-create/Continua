import dotenv from 'dotenv';
import pg from 'pg';
import {readFile} from 'node:fs/promises';
dotenv.config({path:'.env.local',quiet:true});
const version='20261012220000',name='native_payment_attempts';
const sql=await readFile(new URL(`../../supabase/migrations/${version}_${name}.sql`,import.meta.url),'utf8');
const client=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000,statement_timeout:30000});
try {
 await client.connect();await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(20261012,220000)');
 const applied=await client.query('SELECT 1 FROM supabase_migrations.schema_migrations WHERE version=$1',[version]);
 if(!applied.rowCount){await client.query(sql);await client.query('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES($1,$2,$3)',[version,name,[sql]]);}
 for(const table of ['paystack_native_attempts','paystack_card_renewals']) {
  const check=await client.query("SELECT NOT has_table_privilege('anon',$1,'SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('authenticated',$1,'SELECT,INSERT,UPDATE,DELETE') AS private",['public.'+table]);
  if(!check.rows[0]?.private)throw new Error('Private payment ledger check failed');
 }
 await client.query(process.argv.includes('--apply')?'COMMIT':'ROLLBACK');
 console.log(JSON.stringify({version,applied:process.argv.includes('--apply'),private:true}));
}catch{await client.query('ROLLBACK').catch(()=>{});console.error('Native payment migration failed; rolled back.');process.exitCode=1;}finally{await client.end().catch(()=>{});}
