import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {readStagingFixtureInputs} from './staging-fixture-inputs.mjs';
const {root,url}=readStagingFixtureInputs();url.searchParams.set('sslmode','verify-full');
const credentials=JSON.parse(fs.readFileSync(path.join(root,'render-r2-secrets.json'),'utf8'));
Object.assign(process.env,{DATABASE_URL:url.href,NODE_ENV:'test',LOG_LEVEL:'fatal',RAW_STORAGE_DRIVER:'r2',R2_DUAL_WRITE:'false',SCHEDULER_ENABLED:'false'});
for(const name of ['R2_ACCOUNT_ID','R2_BUCKET','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY']){if(!credentials[name])throw Error('Existing R2 reader is incomplete');process.env[name]=credentials[name];}
for(const name of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_STORAGE_BUCKET'])delete process.env[name];
const [{findUnextracted},{readRawArtifact},{pool}]=await Promise.all([import('../../scraper/src/storage/extractionsRepository.js'),import('../../scraper/src/storage/rawStorage.js'),import('../../scraper/src/storage/db.js')]);
try{
 const pending=await findUnextracted(5);
 const row=(await pool.query("SELECT storage_path,sha256,size_bytes::text FROM scraping.raw_artifacts WHERE storage_path LIKE 'r2://%' AND size_bytes BETWEEN 1 AND 1048576 ORDER BY id LIMIT 1")).rows[0];
 if(!row)throw Error('No bounded verified original');
 const bytes=await readRawArtifact(row.storage_path);
 if(String(bytes.length)!==row.size_bytes||createHash('sha256').update(bytes).digest('hex')!==row.sha256)throw Error('Render collector original differs from SQL evidence');
 const receipt={stagingOnly:true,deployedCollectorCode:true,schedulerStarted:false,supabaseCredentialPresent:false,extractionQueryPassed:true,privateOriginalHashVerified:true,boundedPendingRows:pending.length,productionChanged:false};
 fs.writeFileSync('.qa-artifacts/neon-migration/render-collector-read-receipt.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}finally{await pool.end();}
