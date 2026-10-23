import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readApprovedProductionInputs} from './production-inputs.mjs';

test('production operators require explicit approval and the exact existing branch and TLS endpoint',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'continua-production-guard-'));
 const previous=process.env.CONTINUA_MIGRATION_PRIVATE_DIR;
 const approval={productionCutover:true,projectId:'orange-bird-13151544',branchId:'br-noisy-block-b4z5yxup'};
 const endpoint='postgresql://fixture:synthetic@ep-nameless-voice-b4ygobrp.c-6.us-east-2.aws.neon.tech/neondb?sslmode=verify-full';
 const writeApproval=value=>fs.writeFileSync(path.join(directory,'production-cutover-approval.json'),JSON.stringify(value));
 try{
  process.env.CONTINUA_MIGRATION_PRIVATE_DIR=directory;
  assert.throws(()=>readApprovedProductionInputs());
  fs.writeFileSync(path.join(directory,'neon-direct.snippet'),endpoint);
  writeApproval({...approval,productionCutover:false});assert.throws(()=>readApprovedProductionInputs());
  writeApproval({...approval,branchId:'br-still-field-b4mo8s63'});assert.throws(()=>readApprovedProductionInputs());
  writeApproval(approval);
  for(const invalid of [endpoint.replace('ep-nameless-voice-b4ygobrp','ep-other'),endpoint.replace('/neondb?','/other?'),endpoint.replace('verify-full','disable')]){
   fs.writeFileSync(path.join(directory,'neon-direct.snippet'),invalid);assert.throws(()=>readApprovedProductionInputs());
  }
  fs.writeFileSync(path.join(directory,'neon-direct.snippet'),endpoint);
  const actual=readApprovedProductionInputs();
  assert.equal(actual.url.hostname,'ep-nameless-voice-b4ygobrp.c-6.us-east-2.aws.neon.tech');
  assert.equal(actual.url.searchParams.has('sslmode'),false);
 }finally{
  if(previous===undefined)delete process.env.CONTINUA_MIGRATION_PRIVATE_DIR;else process.env.CONTINUA_MIGRATION_PRIVATE_DIR=previous;
  for(const name of ['production-cutover-approval.json','neon-direct.snippet'])fs.rmSync(path.join(directory,name),{force:true});
  fs.rmdirSync(directory);
 }
});
