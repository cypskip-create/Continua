import dotenv from 'dotenv';
import pg from 'pg';
dotenv.config({path:'.env.local',quiet:true});
const client=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000,statement_timeout:15000});
try{await client.connect();
 const source=await client.query("SELECT id,enabled,config->>'schedule' AS schedule,config->>'revisitAfterMinutes' AS revisit_minutes FROM scraping.sources WHERE id='nse-index-summary'");
 const crawl=await client.query("SELECT status,http_status,last_crawled,last_changed FROM scraping.crawl_state WHERE source_id='nse-index-summary' ORDER BY last_crawled DESC NULLS LAST LIMIT 1");
 const artifact=await client.query("SELECT max(retrieved_at) AS latest_new_content FROM scraping.raw_artifacts WHERE source_id='nse-index-summary'");
 const indices=await client.query("SELECT code,event_timestamp,updated_at FROM market.indices WHERE exchange='NSE' ORDER BY code");
 console.log(JSON.stringify({source:source.rows,crawl:crawl.rows,artifact:artifact.rows,indices:indices.rows}));
}catch(e){console.log(JSON.stringify({errorCode:(e as {code?:string}).code??'index_diagnostic_failed'}));process.exitCode=1;}finally{await client.end();}
