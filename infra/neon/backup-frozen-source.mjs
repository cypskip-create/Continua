import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {createHash} from 'node:crypto';import pg from '../../backend/node_modules/pg/lib/index.js';
import {readApprovedProductionInputs} from './production-inputs.mjs';import {existingSourceConnection} from './source-connection.mjs';import {libpqEnvironment} from './safety.mjs';
const {root}=readApprovedProductionInputs();
if(process.env.CONTINUA_CUTOVER_WORKERS_PAUSED!=='true')throw Error('Pause existing workers and workflow opt-ins before final export');
const {url,ca}=existingSourceConnection();
const directory=path.join(root,'cutover-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(directory);
const certificate=path.join(directory,'roots.pem');fs.writeFileSync(certificate,ca.join('\n'),{mode:0o600});
const database=new pg.Client({connectionString:url.href,ssl:{rejectUnauthorized:true,ca},connectionTimeoutMillis:15000,statement_timeout:60000,keepAlive:true,keepAliveInitialDelayMillis:10000,application_name:'continua-final-snapshot-holder'});
let child,keepalive,connectionError;
database.on('error',error=>{connectionError=error;child?.kill();});
try{
 await database.connect();await database.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await database.query("SET LOCAL TIME ZONE 'UTC'");
 const writes=(await database.query("SELECT count(*)::int count FROM information_schema.column_privileges WHERE table_schema IN('public','market','scraping') AND grantee IN('PUBLIC','anon','authenticated') AND privilege_type IN('INSERT','UPDATE','REFERENCES')")).rows[0].count;
 const executions=(await database.query("SELECT count(*)::int count FROM information_schema.routine_privileges WHERE routine_schema IN('public','market','scraping') AND grantee IN('PUBLIC','anon','authenticated') AND privilege_type='EXECUTE'")).rows[0].count;
 if(writes||executions)throw Error('Source browser writes or definer RPCs are not frozen');
 const meta=(await database.query('SELECT pg_export_snapshot() snapshot,current_setting(\'server_version\') version,pg_database_size(current_database())::text bytes')).rows[0];
 const tables=(await database.query("SELECT n.nspname schema,c.relname name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN('pg_catalog','information_schema','pg_toast') AND n.nspname NOT LIKE 'pg_%' AND c.relkind IN('r','p') ORDER BY 1,2")).rows;
 const archive='source-final.dump',environment=libpqEnvironment(url,{certificate,applicationName:'continua-approved-final-export'},process.env);
 fs.writeFileSync(path.join(directory,'export-inputs.json'),JSON.stringify({snapshot:meta.snapshot,sourceVersion:meta.version,databaseBytes:meta.bytes,tables,workersPaused:true,sourceWritesFrozen:true}),{flag:'wx',mode:0o600});
 const dataOptions=process.argv.includes('--copy-stream')?[]:['--rows-per-insert=500'];
 child=spawn('C:/Program Files/PostgreSQL/17/bin/pg_dump.exe',['--verbose',...dataOptions,'--format=custom','--snapshot='+meta.snapshot,'--file='+path.join(directory,archive)],{env:environment,windowsHide:true,stdio:['ignore','ignore','pipe']});
 let diagnostic='';child.stderr.on('data',part=>{diagnostic+=part.toString();fs.appendFileSync(path.join(directory,'export-progress.log'),part,{mode:0o600});});const finished=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
 console.log(JSON.stringify({finalExportStarted:true,tables:tables.length,sourceWritesFrozen:true}));
 const counts=[];for(const table of tables){const q=value=>'"'+value.replaceAll('"','""')+'"';counts.push({...table,count:(await database.query(`SELECT count(*)::text count FROM ${q(table.schema)}.${q(table.name)}`)).rows[0].count});if(counts.length%25===0)console.log(JSON.stringify({snapshotTablesCounted:counts.length,total:tables.length}));}
 fs.writeFileSync(path.join(directory,'snapshot-counts.json'),JSON.stringify(counts),{flag:'wx',mode:0o600});
 // Keep the exported-snapshot holder alive while the independent pg_dump
 // reader finishes. A pooler idle disconnect must never crash the operator or
 // be mistaken for a completed, verified final backup.
 keepalive=setInterval(()=>{database.query('SELECT 1').catch(error=>{connectionError=error;child?.kill();});},10000);
 const code=await finished;clearInterval(keepalive);
 if(code!==0||connectionError){fs.writeFileSync(path.join(directory,'export-error.log'),diagnostic);throw Error('Final export failed; private diagnostic retained');}
 await database.query('COMMIT');const hash=createHash('sha256');for await(const part of fs.createReadStream(path.join(directory,archive)))hash.update(part);
 const manifest={createdAt:new Date().toISOString(),source:'supabase',snapshot:meta.snapshot,sourceVersion:meta.version,databaseBytes:meta.bytes,archive,archiveBytes:fs.statSync(path.join(directory,archive)).size,sha256:hash.digest('hex'),counts,consistentSnapshot:true,sourceFreezeVerified:true,workersPauseConfirmed:true};
 fs.writeFileSync(path.join(directory,'backup-manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx',mode:0o600});
 fs.writeFileSync(path.join(root,'cutover-current.json'),JSON.stringify({directory,snapshot:meta.snapshot,sha256:manifest.sha256}),{mode:0o600});
 console.log(JSON.stringify({finalFrozenBackupComplete:true,tables:counts.length,archiveBytes:manifest.archiveBytes,sha256:manifest.sha256,sourceDataDeleted:false}));
}catch(error){child?.kill();throw error;}finally{clearInterval(keepalive);await database.end();}
