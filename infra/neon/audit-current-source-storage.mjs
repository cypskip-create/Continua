import fs from 'node:fs';
import path from 'node:path';
import pg from '../../backend/node_modules/pg/lib/index.js';
import {existingSourceConnection} from './source-connection.mjs';

// Read-only delta inventory. Missing proofs block cutover; never mark an object
// transferred from metadata alone or silently overwrite an immutable ledger.
const root=process.env.CONTINUA_MIGRATION_PRIVATE_DIR;
if(!root||!path.isAbsolute(root))throw Error('Protected migration directory required');
const proofs=fs.readFileSync(path.join(root,'normalized-storage-transfer-ledger.jsonl'),'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const known=new Map(proofs.filter(row=>row.verified===true).map(row=>[JSON.stringify([row.bucket,row.name]),row]));
const settings=existingSourceConnection();
const database=new pg.Client({connectionString:settings.url.href,ssl:{rejectUnauthorized:true,ca:settings.ca},statement_timeout:30000});
database.on('error',()=>{});
try{
 await database.connect();await database.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const rows=(await database.query('SELECT id::text,bucket_id,name,metadata FROM storage.objects ORDER BY bucket_id,name')).rows;
 const pending=[];let verified=0;
 for(const row of rows){
  const proof=known.get(JSON.stringify([row.bucket_id,row.name]));
  const size=Number(row.metadata?.size),digest=row.name.split('/').at(-1)?.split('.')[0];
  const etag=String(row.metadata?.eTag??row.metadata?.etag??'').replaceAll('"','');
  const matchingDigest=/^[a-f0-9]{64}$/.test(digest)&&proof?.sha256===digest;
  const matchingEtag=/^[a-f0-9]{32}$/i.test(etag)&&proof?.sourceEtag===etag;
  if(proof&&Number.isSafeInteger(size)&&size>=0&&proof.bytes===size&&(matchingDigest||matchingEtag))verified++;
  else pending.push({...row,expectedBytes:size,expectedSha256:/^[a-f0-9]{64}$/.test(digest)?digest:null});
 }
 await database.query('COMMIT');
 fs.writeFileSync(path.join(root,'current-storage-delta.json'),JSON.stringify(pending),{mode:0o600});
 const receipt={checkedAt:new Date().toISOString(),sourceObjects:rows.length,objectsWithExactExistingProof:verified,objectsRequiringFreshTransfer:pending.length,sourceModified:false,ready:pending.length===0};
 fs.writeFileSync('.qa-artifacts/neon-migration/current-storage-delta-receipt.json',JSON.stringify(receipt,null,2));
 console.log(JSON.stringify(receipt));if(pending.length)process.exitCode=1;
}finally{await database.end();}
