import fs from 'node:fs';
import path from 'node:path';
import pg from '../../backend/node_modules/pg/lib/index.js';
import {readApprovedProductionInputs} from './production-inputs.mjs';
import {existingSourceConnection} from './source-connection.mjs';

// Run before opening production writes. Source Auth can still change credentials
// independently of the application-schema write freeze.
const {root,url}=readApprovedProductionInputs();
const pointer=JSON.parse(fs.readFileSync(path.join(root,'cutover-current.json'),'utf8'));
const directory=path.resolve(pointer.directory);
if(!directory.startsWith(path.resolve(root)+path.sep)||!path.basename(directory).startsWith('cutover-'))throw Error('Protected final backup required');
const receipt=JSON.parse(fs.readFileSync(path.join(directory,'production-import-receipt.json'),'utf8'));
if(receipt.sourceSnapshot!==pointer.snapshot||!receipt.exactPostgresRowHashesMatched)throw Error('Verified final import required');
const sourceSettings=existingSourceConnection();
const source=new pg.Client({connectionString:sourceSettings.url.href,ssl:{rejectUnauthorized:true,ca:sourceSettings.ca},statement_timeout:120000});
const target=new pg.Client({connectionString:url.href,ssl:{rejectUnauthorized:true},statement_timeout:30000});
source.on('error',()=>{});target.on('error',()=>{});
try{
 await source.connect();await target.connect();
 await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 await target.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 await source.query("SET LOCAL TIME ZONE 'UTC'");await target.query("SET LOCAL TIME ZONE 'UTC'");
 const quote=value=>'"'+value.replaceAll('"','""')+'"';
 for(const row of receipt.results){
  const actual=(await source.query(`SELECT count(*)::text count,encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(row_to_json(t)::text,'UTF8')),'hex'),'' ORDER BY row_to_json(t)::text COLLATE "C"),''),'UTF8')),'hex') hash FROM ${quote(row.schema)}.${quote(row.table)} t`)).rows[0];
  if(actual.count!==row.count||actual.hash!==row.sha256)throw Error('Source application changed after import; keep maintenance enabled');
 }
 const original=(await source.query('SELECT id::text,email,email_confirmed_at IS NOT NULL AS verified,encrypted_password,deleted_at IS NOT NULL AS deleted,is_anonymous,coalesce(banned_until>now(),false) banned FROM auth.users ORDER BY id')).rows;
 const imported=(await target.query('SELECT u.id::text,u.email,u."emailVerified" verified,a.password FROM app_identity.continua_auth_user u JOIN app_identity.continua_auth_account a ON a."userId"=u.id AND a."providerId"=\'credential\' ORDER BY u.id')).rows;
 if(original.length!==receipt.originalUsers||original.length!==imported.length||original.some((row,index)=>{const copy=imported[index];return row.id!==copy.id||row.email!==copy.email||row.verified!==copy.verified||row.encrypted_password!==copy.password||row.deleted||row.is_anonymous||row.banned;}))throw Error('Source identity or credentials changed; a reviewed resync is required');
 if((await source.query("SELECT count(*)::int count FROM auth.mfa_factors WHERE status='verified'")).rows[0].count!==0)throw Error('Source MFA changed; refusing security loss');
 if((await target.query('SELECT count(*)::int count FROM app_identity.continua_auth_session')).rows[0].count!==0)throw Error('Run final stability check before production sign-in is enabled');
 await source.query('COMMIT');await target.query('COMMIT');
 const result={checkedAt:new Date().toISOString(),sourceSnapshot:pointer.snapshot,sourceTablesUnchanged:receipt.results.length,identitiesAndPasswordDigestsMatch:true,verifiedSourceMfaFactors:0,productionSessions:0,writesOpened:false};
 fs.writeFileSync(path.join(directory,'source-final-stability-receipt.json'),JSON.stringify(result,null,2),{mode:0o600});
 console.log(JSON.stringify(result));
}finally{await source.end();await target.end();}
