import fs from 'node:fs';import pg from '../../backend/node_modules/pg/lib/index.js';
import {readStagingFixtureInputs} from './staging-fixture-inputs.mjs';import {captureBrowserPermissions} from './permissions.mjs';
const {url}=readStagingFixtureInputs(),database=new pg.Client({connectionString:url.href,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:15000});
try{
 await database.connect();const before=await captureBrowserPermissions(database);await database.query('BEGIN');
 try{
  const freeze=fs.readFileSync('infra/neon/source-write-freeze.sql','utf8').replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'');
  await database.query(freeze);
  const remaining=(await database.query(`SELECT count(*)::int count FROM information_schema.column_privileges WHERE table_schema IN('public','market','scraping') AND grantee IN('PUBLIC','anon','authenticated') AND privilege_type IN('INSERT','UPDATE','REFERENCES')`)).rows[0].count;
  if(remaining!==0)throw Error('Column write permissions survived the freeze');
 }finally{await database.query('ROLLBACK');}
 const after=await captureBrowserPermissions(database);if(before.sha256!==after.sha256)throw Error('Rehearsal did not restore exact permissions');
 const receipt={stagingOnly:true,freezeBlockedColumnWrites:true,rollbackRestoredExactPermissions:true,originalGrantStatements:before.statements,productionChanged:false,sourcePermissionsChanged:false};
 fs.writeFileSync('.qa-artifacts/neon-migration/freeze-rehearsal-receipt.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}finally{await database.end();}
