import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';import pg from '../../backend/node_modules/pg/lib/index.js';
import {getMigrations} from '../../backend/node_modules/better-auth/dist/db/get-migration.mjs';
import {createContinuaAuth} from '../../backend/src/auth/continuaAuth.js';import {importLegacyCredentials} from './import-credentials.mjs';
import {readApprovedProductionInputs} from './production-inputs.mjs';import {existingSourceConnection} from './source-connection.mjs';
import {applicationRestoreList,applicationDDL,applicationSchemas,libpqEnvironment} from './safety.mjs';
const {root,url}=readApprovedProductionInputs();
const pointer=JSON.parse(fs.readFileSync(path.join(root,'cutover-current.json'),'utf8')),directory=path.resolve(pointer.directory);
if(!directory.startsWith(path.resolve(root)+path.sep)||!path.basename(directory).startsWith('cutover-'))throw Error('Final backup must remain in protected migration storage');
const manifest=JSON.parse(fs.readFileSync(path.join(directory,'backup-manifest.json'),'utf8'));
if(!manifest.sourceFreezeVerified||!manifest.workersPauseConfirmed||manifest.sha256!==pointer.sha256||manifest.snapshot!==pointer.snapshot)throw Error('A verified frozen final source snapshot is required');
const archive=path.join(directory,manifest.archive),digest=createHash('sha256');for await(const bytes of fs.createReadStream(archive))digest.update(bytes);if(digest.digest('hex')!==manifest.sha256)throw Error('Final backup checksum mismatch');
const originalPermissions=JSON.parse(fs.readFileSync(path.join(root,'source-permissions-current.json'),'utf8'));
const originalSql=fs.readFileSync(path.join(root,originalPermissions.filename),'utf8');
const permissionBody=originalSql.split('\n').filter(line=>!line.startsWith('--')).join('\n');
if(createHash('sha256').update(permissionBody).digest('hex')!==originalPermissions.sha256)throw Error('Original permission capture changed');
const sourceSettings=existingSourceConnection();
const source=new pg.Client({connectionString:sourceSettings.url.href,ssl:{rejectUnauthorized:true,ca:sourceSettings.ca},connectionTimeoutMillis:15000,statement_timeout:120000});
const target=new pg.Client({connectionString:url.href,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:15000,statement_timeout:120000});
const authDatabase=new pg.Pool({connectionString:url.href,ssl:{rejectUnauthorized:true},max:2,options:'-c search_path=app_identity,public',statement_timeout:30000});
for(const client of [source,target])client.on('error',()=>{});authDatabase.on('error',()=>{});
const bin='C:/Program Files/PostgreSQL/17/bin/pg_restore.exe';
function restore(args,options={}){const result=spawnSync(bin,args,{windowsHide:true,encoding:'utf8',maxBuffer:10000000,timeout:1800000,...options});if(result.status!==0){fs.writeFileSync(path.join(directory,'production-restore-diagnostic.log'),String(result.stderr??result.error??''));throw Error('Restore failed; private diagnostic retained. No automatic deletion or overwrite is permitted.');}return result.stdout;}
let phase='preflight',targetConnected=false;
try{
 await source.connect();await target.connect();targetConnected=true;
 if((await source.query("SELECT count(*)::int count FROM auth.mfa_factors WHERE status='verified'")).rows[0].count!==0)throw Error('New source MFA factors require a reviewed import; refusing security loss');
 if((await target.query("SELECT count(*)::int count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','market','scraping','app_identity') AND c.relkind IN('r','p')")).rows[0].count!==0)throw Error('Production application target is not empty; refusing overwrite');
 const toc=restore(['--list',archive]),list=path.join(directory,'application.list');fs.writeFileSync(list,applicationRestoreList(toc));
 const aclList=path.join(directory,'acl.list');fs.writeFileSync(aclList,toc.split(/\r?\n/).filter(line=>/^\d+; \d+ \d+ ACL (public|market|scraping) /.test(line)).join('\n'));
 const acl=restore(['--schema-only','--no-owner','--use-list='+aclList,'--file=-',archive]);
 phase='identity-bootstrap';await target.query('BEGIN');await target.query(fs.readFileSync('infra/neon/identity-bootstrap.sql','utf8'));
 await target.query("INSERT INTO app_identity.migration_control(id,mode,source_project,source_snapshot) VALUES(true,'cutover-ready','jjsetogmnumoudrovpzn',$1)",[manifest.snapshot]);
 await source.query("SET TIME ZONE 'UTC'");await target.query("SET TIME ZONE 'UTC'");
 const users=(await source.query('SELECT id::text,email,email_confirmed_at::text,raw_user_meta_data::text,raw_app_meta_data::text,phone,phone_confirmed_at::text,created_at::text,updated_at::text,deleted_at::text FROM auth.users ORDER BY id')).rows;
 for(const user of users)await target.query("INSERT INTO app_identity.users(id,email,email_confirmed_at,raw_user_meta_data,raw_app_meta_data,phone,phone_confirmed_at,created_at,updated_at,deleted_at,source_provider) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9,$10,'supabase')",[user.id,user.email,user.email_confirmed_at,user.raw_user_meta_data??'{}',user.raw_app_meta_data??'{}',user.phone,user.phone_confirmed_at,user.created_at,user.updated_at,user.deleted_at]);
 await target.query('COMMIT');
 for(const section of ['pre-data','data','post-data']){
  phase=section;
  if(section==='data')restore(['--exit-on-error','--no-owner','--no-acl','--section=data','--dbname=neondb','--use-list='+list,archive],{env:libpqEnvironment(url,{certificate:path.join(directory,'roots.pem'),applicationName:'continua-approved-production-import'},process.env)});
  else{const sql=applicationDDL(restore(['--no-owner','--no-acl','--section='+section,'--use-list='+list,'--file=-',archive]),section);await target.query('BEGIN');await target.query(sql);await target.query('COMMIT');}
  console.log(JSON.stringify({productionImportPhase:section,sourceDataDeleted:false}));
 }
 phase='exact-data-validation';const tables=manifest.counts.filter(row=>applicationSchemas.has(row.schema)),results=[];
 for(const table of tables){
  const q=value=>'"'+value.replaceAll('"','""')+'"';const sql=`SELECT count(*)::text count,encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(row_to_json(t)::text,'UTF8')),'hex'),'' ORDER BY row_to_json(t)::text COLLATE "C"),''),'UTF8')),'hex') hash FROM ${q(table.schema)}.${q(table.name)} t`;
  const [a,b]=await Promise.all([source.query(sql),target.query(sql)]);if(a.rows[0].count!==table.count||a.rows[0].count!==b.rows[0].count||a.rows[0].hash!==b.rows[0].hash)throw Error('Final source and target data differ; keep maintenance enabled');
  results.push({schema:table.schema,table:table.name,count:table.count,sha256:a.rows[0].hash});
 }
 phase='auth-schema';const secret=fs.readFileSync(path.join(root,'better-auth-production.secret'),'utf8');
 const auth=createContinuaAuth({database:authDatabase,testOnly:true,secret,baseURL:'https://production-schema-setup.invalid',trustedOrigins:['https://production-schema-setup.invalid'],sendMail:async()=>{throw Error('Schema setup never sends mail');}});
 await (await getMigrations(auth.options)).runMigrations();await importLegacyCredentials(source,target);
 phase='auth-integration-and-permissions';
 for(const filename of ['better-auth-integration.sql','auth-profile-metadata.sql','auth-email-budget.sql','oauth-assurance.sql','account-cleanup.sql','billing-owner-guard.sql','request-roles.sql'])await target.query(fs.readFileSync('infra/neon/'+filename,'utf8'));
 await target.query(acl);await target.query(permissionBody);
 const receipt={existingProject:'orange-bird-13151544',productionBranch:'br-noisy-block-b4z5yxup',sourceSnapshot:manifest.snapshot,applicationTables:results.length,exactPostgresRowHashesMatched:true,originalUsers:users.length,syntheticStagingUsersImported:false,legacySessionsImported:false,sourceDataDeleted:false,providerConfigurationSwitched:false,results};
 fs.writeFileSync(path.join(directory,'production-import-receipt.json'),JSON.stringify(receipt,null,2),{mode:0o600});console.log(JSON.stringify({...receipt,results:undefined}));
}catch(error){console.error(JSON.stringify({productionImportFailed:true,phase,keepMaintenanceEnabled:true,errorClass:error.name,code:error.code??null}));if(targetConnected)await target.query('ROLLBACK').catch(()=>{});process.exitCode=1;}
finally{await source.end();await target.end();await authDatabase.end();}
