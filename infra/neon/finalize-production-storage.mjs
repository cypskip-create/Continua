import fs from 'node:fs';import path from 'node:path';import pg from '../../backend/node_modules/pg/lib/index.js';
import {readApprovedProductionInputs} from './production-inputs.mjs';import {planStorageReferences} from './storage-references.mjs';
const {root,url,approval}=readApprovedProductionInputs();
const readLines=name=>fs.readFileSync(path.join(root,name),'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const ledger=readLines('normalized-storage-transfer-ledger.jsonl'),recovered=readLines('raw-reference-recovery-ledger.jsonl');
const historical=new Map(JSON.parse(fs.readFileSync(path.join(root,'unmapped-staging-raw-artifacts.json'),'utf8')).map(row=>[row.id,row]));
const database=new pg.Client({connectionString:url.href,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:15000,statement_timeout:30000});
try{
 await database.connect();
 if((await database.query('SELECT mode FROM app_identity.migration_control WHERE id=true')).rows[0]?.mode!=='cutover-ready'||(await database.query('SELECT count(*)::int count FROM app_identity.continua_auth_session')).rows[0].count!==0)throw Error('Reference mapping must precede opening production sessions');
 const artifacts=(await database.query("SELECT id::text,sha256,size_bytes::text,storage_path FROM scraping.raw_artifacts WHERE storage_path NOT LIKE 'r2://%'")).rows;
 const rows=new Map(artifacts.map(row=>[row.id,row]));const plan=planStorageReferences(artifacts,ledger,{recovered});
 if(plan.unresolved.length&&approval.historicalGapAcknowledged!==true)throw Error('The preserved pre-existing historical availability gap requires explicit acknowledgement');
 for(const unresolved of plan.unresolved){const original=historical.get(unresolved.id),current=rows.get(unresolved.id);if(!original||original.sha256!==current.sha256||original.size_bytes!==current.size_bytes||original.storage_path!==current.storage_path)throw Error('Unexpected new unresolved original; do not open production writes');}
 await database.query('BEGIN');
 const updated=await database.query(`UPDATE scraping.raw_artifacts a SET storage_path=p.target,metadata=coalesce(a.metadata,'{}'::jsonb)||jsonb_build_object('neonMigrationOriginalStoragePath',a.storage_path)
 FROM jsonb_to_recordset($1::jsonb) AS p(id text,"originalPath" text,sha256 text,bytes text,target text)
 WHERE a.id=p.id::bigint AND a.storage_path=p."originalPath" AND a.sha256=p.sha256 AND a.size_bytes=p.bytes::bigint RETURNING a.id`,[JSON.stringify(plan.updates)]);
 if(updated.rowCount!==plan.updates.length)throw Error('Reference inputs changed after verification');await database.query('COMMIT');
 const receipt={production:true,verifiedReferencesUpdated:updated.rowCount,preservedHistoricalUnresolvedReferences:plan.unresolved.length,originalPathsAndHashesPreserved:true,sourceObjectsDeleted:0,allHistoricalFilesAvailable:plan.ready};
 fs.writeFileSync('.qa-artifacts/neon-migration/production-storage-reference-receipt.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}catch(error){await database.query('ROLLBACK').catch(()=>{});throw error;}finally{await database.end();}
