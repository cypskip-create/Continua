import dotenv from 'dotenv';
import pg from 'pg';
import {readFile} from 'node:fs/promises';
dotenv.config({path:'.env.local',quiet:true});
const version='20261011100000',name='invalid_filing_archive';
const sql=await readFile(new URL(`../../supabase/migrations/${version}_${name}.sql`,import.meta.url),'utf8');
const client=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000,statement_timeout:60000});
try {
 await client.connect();await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(20261011,100000)');
 const applied=await client.query('SELECT 1 FROM supabase_migrations.schema_migrations WHERE version=$1',[version]);
 if(!applied.rowCount){await client.query(sql);await client.query('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES($1,$2,$3)',[version,name,[sql]]);}
 const result=await client.query("SELECT NOT has_table_privilege('anon','market.invalid_filing_archive','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('authenticated','market.invalid_filing_archive','SELECT,INSERT,UPDATE,DELETE') AS private");
 if(!result.rows[0]?.private)throw new Error('Private archive check failed');
 await client.query(process.argv.includes('--apply')?'COMMIT':'ROLLBACK');
 console.log(JSON.stringify({version,applied:process.argv.includes('--apply'),private:true}));
}catch{await client.query('ROLLBACK').catch(()=>{});console.error('Archive migration failed; rolled back.');process.exitCode=1;}finally{await client.end().catch(()=>{});}
