import dotenv from 'dotenv';
import pg from 'pg';
import {readFile} from 'node:fs/promises';
dotenv.config({path:'.env.local',quiet:true});
const version='20261011211500',name='candle_provenance';
const sql=await readFile(new URL(`../../supabase/migrations/${version}_${name}.sql`,import.meta.url),'utf8');
const db=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000,statement_timeout:60000});
try{
 await db.connect();await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(20261011,211500)');
 const applied=await db.query('SELECT 1 FROM supabase_migrations.schema_migrations WHERE version=$1',[version]);
 if(!applied.rowCount){await db.query(sql);await db.query('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES($1,$2,$3)',[version,name,[sql]]);}
 const result=await db.query(`SELECT count(*)::int AS preserved_rows,count(source_url)::int AS traceable_rows FROM market.candles`);
 await db.query(process.argv.includes('--apply')?'COMMIT':'ROLLBACK');
 console.log(JSON.stringify({version,applied:process.argv.includes('--apply'),...result.rows[0]}));
}catch{await db.query('ROLLBACK').catch(()=>{});console.error('Migration failed and rolled back.');process.exitCode=1;}
finally{await db.end().catch(()=>{});}
