import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {readStagingFixtureInputs} from './staging-fixture-inputs.mjs';
test('staging fixtures require an explicit protected directory and reject production manifests',()=>{
 const oldRoot=process.env.CONTINUA_MIGRATION_PRIVATE_DIR,oldManifest=process.env.CONTINUA_MIGRATION_MANIFEST;
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'continua-fixture-input-test-'));
 try{
  delete process.env.CONTINUA_MIGRATION_PRIVATE_DIR;assert.throws(()=>readStagingFixtureInputs(),/protected migration directory/);
  process.env.CONTINUA_MIGRATION_PRIVATE_DIR=root;process.env.CONTINUA_MIGRATION_MANIFEST=path.join(root,'manifest.json');
  fs.writeFileSync(process.env.CONTINUA_MIGRATION_MANIFEST,JSON.stringify({branch:{id:'br-noisy-block-b4z5yxup',name:'production'}}));
  assert.throws(()=>readStagingFixtureInputs(),/original isolated migration branch/);
  const host='ep-curly-cell-b4cvhxkd.c-6.us-east-2.aws.neon.tech';
  fs.writeFileSync(process.env.CONTINUA_MIGRATION_MANIFEST,JSON.stringify({branch:{id:'br-still-field-b4mo8s63',name:'continua-migration-staging-fixture',project_id:'orange-bird-13151544'},endpoints:[{host,branch_id:'br-still-field-b4mo8s63'}]}));
  fs.writeFileSync(path.join(root,'neon-staging.url'),`postgresql://fixture:dummy@${host}/neondb?sslmode=require`);
  const inputs=readStagingFixtureInputs();assert.equal(inputs.url.hostname,host);assert.equal(inputs.url.searchParams.has('sslmode'),false);
 }finally{
  if(oldRoot===undefined)delete process.env.CONTINUA_MIGRATION_PRIVATE_DIR;else process.env.CONTINUA_MIGRATION_PRIVATE_DIR=oldRoot;
  if(oldManifest===undefined)delete process.env.CONTINUA_MIGRATION_MANIFEST;else process.env.CONTINUA_MIGRATION_MANIFEST=oldManifest;
  // Delete only the known files created by this test, then its empty directory.
  for(const name of ['manifest.json','neon-staging.url'])fs.rmSync(path.join(root,name),{force:true});fs.rmdirSync(root);
 }
});
