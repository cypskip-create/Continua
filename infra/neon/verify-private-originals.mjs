import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {createGunzip} from 'node:zlib';import pg from '../../backend/node_modules/pg/lib/index.js';
import {pipeline} from 'node:stream/promises';
import {S3Client,GetObjectCommand} from '../../backend/node_modules/@aws-sdk/client-s3/dist-cjs/index.js';
import {readStagingFixtureInputs} from './staging-fixture-inputs.mjs';import {readApprovedProductionInputs} from './production-inputs.mjs';
const production=process.argv.includes('--production'),{root,url}=production?readApprovedProductionInputs():readStagingFixtureInputs();
const settings=JSON.parse(fs.readFileSync(path.join(root,'render-r2-secrets.json'),'utf8'));
if(settings.R2_BUCKET!=='continua-financial-documents')throw Error('Private bucket changed');
const proofs=new Set();
const proofKey=(key,sha256,bytes)=>JSON.stringify([key,sha256,String(bytes)]);
for(const filename of ['normalized-storage-transfer-ledger.jsonl','raw-reference-recovery-ledger.jsonl','additional-original-verifications.jsonl']){
 if(!fs.existsSync(path.join(root,filename)))continue;
 for(const line of fs.readFileSync(path.join(root,filename),'utf8').trim().split(/\r?\n/).filter(Boolean)){
  const row=JSON.parse(line);if(row.verified!==true)continue;proofs.add(proofKey(row.key,row.sha256,row.bytes));
  if(row.previouslyVerifiedR2Key)proofs.add(proofKey(row.previouslyVerifiedR2Key,row.sha256,row.bytes));
 }
}
const database=new pg.Pool({connectionString:url.href,ssl:{rejectUnauthorized:true},max:1,connectionTimeoutMillis:15000,statement_timeout:30000});
database.on('error',()=>{});
const s3=new S3Client({region:'auto',endpoint:`https://${settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,credentials:{accessKeyId:settings.R2_ACCESS_KEY_ID,secretAccessKey:settings.R2_SECRET_ACCESS_KEY},maxAttempts:2});
try{
 const sql="SELECT id::text,storage_path,sha256,size_bytes::text FROM scraping.raw_artifacts WHERE storage_path LIKE 'r2://%' ORDER BY id";
 let rows;
 if(process.argv.includes('--https-read')){
  // Optional QA-only official driver; application SQL still uses its existing
  // transactional pg connection. No credentials are sent to another host.
  const {neon}=await import('../../.qa-artifacts/neon-http-operator/node_modules/@neondatabase/serverless/index.mjs');
  rows=await neon(url.href).query(sql,[],{fetchOptions:{redirect:'error',signal:AbortSignal.timeout(30000)}});
 }else rows=(await database.query(sql)).rows;
 let reused=0,verified=0,verifiedBytes=0;const pending=[],seen=new Set();
 for(const row of rows){
  const location=new URL(row.storage_path),key=decodeURIComponent(location.pathname.slice(1)),size=Number(row.size_bytes);
  if(location.hostname!==settings.R2_BUCKET||location.search||location.hash||key.split('/').some(part=>!part||part==='.'||part==='..'||/[\\\x00-\x1f]/.test(part))||!Number.isSafeInteger(size)||size<0||size>67108864||!/^[a-f0-9]{64}$/.test(row.sha256))throw Error('Unexpected private original reference');
  const id=proofKey(key,row.sha256,row.size_bytes);
  if(proofs.has(id)){reused++;continue;}if(seen.has(id))continue;seen.add(id);pending.push({...row,key,size});
 }
 console.log(JSON.stringify({privateOriginalReferences:rows.length,reusedExactVerificationProofs:reused,additionalObjectsToVerify:pending.length,production}));
 async function verifyRow(row){
  const response=await s3.send(new GetObjectCommand({Bucket:settings.R2_BUCKET,Key:row.key}),{abortSignal:AbortSignal.timeout(60000)});
  const compressed=row.key.split('/').length===3&&/\.(?:html|json|csv|xml)\.gz$/.test(row.key),stream=compressed?createGunzip():response.Body;
  const transferred=compressed?pipeline(response.Body,stream).catch(error=>error):Promise.resolve(null);
  const hash=createHash('sha256');let size=0;
  try{for await(const part of stream){size+=part.length;if(size>row.size)throw Error('Private original exceeds SQL size');hash.update(part);}}
  finally{stream.destroy();response.Body.destroy();await transferred;}
  if(size!==row.size||hash.digest('hex')!==row.sha256)throw Error('Private original differs from SQL hash');
 }
 let index=0,failure;async function worker(){while(!failure&&index<pending.length){const row=pending[index++];
  try{
   for(let attempt=0;;attempt++){
    try{await verifyRow(row);break;}
    catch(error){
     const transient=['ECONNRESET','ETIMEDOUT','ENOTFOUND','EAI_AGAIN','Z_BUF_ERROR'].includes(error.code??error.cause?.code)||['AbortError','TimeoutError'].includes(error.name)||error.$metadata?.httpStatusCode>=500;
     if(attempt>=4||!transient)throw error;
     await new Promise(resolve=>setTimeout(resolve,Math.min(8000,1000*2**attempt)));
    }
   }
  fs.appendFileSync(path.join(root,'additional-original-verifications.jsonl'),JSON.stringify({key:row.key,sha256:row.sha256,bytes:row.size,verified:true,verifiedAt:new Date().toISOString()})+'\n',{mode:0o600});
  verified++;verifiedBytes+=row.size;if(verified%50===0)console.log(JSON.stringify({additionalObjectsVerified:verified,total:pending.length}));
  }catch(error){failure=error;fs.writeFileSync(path.join(root,'private-original-verification-failure.json'),JSON.stringify({artifactId:row.id,code:error.code??error.name,at:new Date().toISOString()}),{mode:0o600});}
 }}
 await Promise.all([worker(),worker(),worker(),worker()]);
 if(failure)throw Error('Private original verification failed after bounded retries; private diagnostic retained');
 const receipt={production,stagingOnly:!production,privateOriginalReferences:rows.length,reusedExactVerificationProofs:reused,additionalObjectsVerified:verified,additionalDecodedBytesVerified:verifiedBytes,allR2ReferencesVerified:true,legacyUnavailableReferencesExcluded:true,sourceObjectsDeleted:false};
 fs.writeFileSync('.qa-artifacts/neon-migration/'+(production?'production':'staging')+'-private-originals-receipt.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}finally{await database.end();s3.destroy();}
