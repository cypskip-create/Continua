import fs from 'node:fs';
import path from 'node:path';
import pg from '../../backend/node_modules/pg/lib/index.js';
import {readStagingFixtureInputs} from './staging-fixture-inputs.mjs';
import {planStorageReferences} from './storage-references.mjs';

// This operator is deliberately staging-only. Production needs a fresh ledger,
// write freeze, reconciliation and a separately reviewed cutover operation.
const {root,url}=readStagingFixtureInputs();
const readLines=file=>fs.readFileSync(path.join(root,file),'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const ledger=readLines('normalized-storage-transfer-ledger.jsonl'),recovered=readLines('raw-reference-recovery-ledger.jsonl');
const database=new pg.Pool({connectionString:url.href,ssl:{rejectUnauthorized:true},max:1});
try{
 const artifacts=(await database.query("SELECT id::text,sha256,size_bytes::text,storage_path FROM scraping.raw_artifacts WHERE storage_path NOT LIKE 'r2://%'")).rows;
 const plan=planStorageReferences(artifacts,ledger,{recovered});
 fs.writeFileSync(path.join(root,'staging-storage-reference-plan.json'),JSON.stringify(plan),{mode:0o600});
 let applied=0;
 if(process.argv.includes('--apply')){
  const client=await database.connect();
  try{
   await client.query('BEGIN');await client.query("SET LOCAL statement_timeout='30000ms'");
   const result=await client.query(`UPDATE scraping.raw_artifacts a SET storage_path=p.target,
    metadata=coalesce(a.metadata,'{}'::jsonb)||jsonb_build_object('neonMigrationOriginalStoragePath',a.storage_path)
    FROM jsonb_to_recordset($1::jsonb) AS p(id text,"originalPath" text,sha256 text,bytes text,target text)
    WHERE a.id=p.id::bigint AND a.storage_path=p."originalPath" AND a.sha256=p.sha256 AND a.size_bytes=p.bytes::bigint RETURNING a.id`,[JSON.stringify(plan.updates)]);
   if(result.rowCount!==plan.updates.length)throw Error('Storage references changed after verification; rollback required');
   await client.query('COMMIT');applied=result.rowCount;
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
  finally{client.release();}
 }
 const receipt={stagingOnly:true,verifiedReferencesPlanned:plan.updates.length,verifiedReferencesApplied:applied,unresolvedHistoricalReferences:plan.unresolved.length,allHistoricalReferencesResolved:plan.ready,originalPathsRetained:true,productionChanged:false,sourceObjectsDeleted:false};
 fs.writeFileSync('.qa-artifacts/neon-migration/staging-storage-reference-receipt.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}finally{await database.end();}
