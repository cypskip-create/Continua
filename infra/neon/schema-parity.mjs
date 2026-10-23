import fs from 'node:fs';import path from 'node:path';import pg from '../../backend/node_modules/pg/lib/index.js';
import {readStagingFixtureInputs} from './staging-fixture-inputs.mjs';
import {readApprovedProductionInputs} from './production-inputs.mjs';
import {existingSourceConnection} from './source-connection.mjs';
const production=process.argv.includes('--production');
const {root,url}=production?readApprovedProductionInputs():readStagingFixtureInputs();
const sourceSettings=production?existingSourceConnection():null;
const original=new pg.Client(production?{connectionString:sourceSettings.url.href,ssl:{rejectUnauthorized:true,ca:sourceSettings.ca},connectionTimeoutMillis:15000}:{host:'127.0.0.1',port:55432,user:'continua_restore',password:fs.readFileSync(path.join(root,'restore-password'),'utf8'),database:'continua_restore_fixture_20261022'});
const target=new pg.Client({connectionString:url.href,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:15000});
const queries={
 constraints:`SELECT n.nspname||'.'||c.relname||'.'||con.conname name,pg_get_constraintdef(con.oid) definition FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','market','scraping') ORDER BY 1`,
 indexes:`SELECT schemaname||'.'||tablename||'.'||indexname name,indexdef definition FROM pg_indexes WHERE schemaname IN('public','market','scraping') ORDER BY 1`,
 policies:`SELECT schemaname||'.'||tablename||'.'||policyname name,jsonb_build_object('roles',roles,'cmd',cmd,'qual',qual,'with_check',with_check)::text definition FROM pg_policies WHERE schemaname IN('public','market','scraping') ORDER BY 1`,
 rls:`SELECT n.nspname||'.'||c.relname name,c.relrowsecurity::text||':'||c.relforcerowsecurity::text definition FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','market','scraping') AND c.relkind IN('r','p') ORDER BY 1`,
};
const normalize=value=>value.replaceAll('auth.users','app_identity.users').replaceAll('auth.mfa_factors','app_identity.mfa_factors').replace(/\s+/g,' ').trim();
try{
 await original.connect();await target.connect();const checks={},differences=[];
 for(const [kind,sql]of Object.entries(queries)){
  const expected=(await original.query(sql)).rows,actual=new Map((await target.query(sql)).rows.map(row=>[row.name,row.definition]));
  const changed=expected.filter(row=>!actual.has(row.name)||normalize(actual.get(row.name))!==normalize(row.definition));
  checks[kind]={originalObjects:expected.length,matched:expected.length-changed.length};
  differences.push(...changed.map(row=>({kind,name:row.name,expected:row.definition,actual:actual.get(row.name)??null})));
 }
 const receipt={stagingOnly:!production,originalSnapshotSchemaChecked:!production,currentSourceSchemaChecked:production,checks,allOriginalObjectsMatch:differences.length===0,differences,productionChanged:false};
 fs.writeFileSync('.qa-artifacts/neon-migration/'+(production?'production-':'')+'schema-parity-receipt.json',JSON.stringify(receipt,null,2));
 console.log(JSON.stringify({...receipt,differences:differences.map(row=>({kind:row.kind,name:row.name}))}));
 if(differences.length)process.exitCode=1;
}finally{await original.end();await target.end();}
