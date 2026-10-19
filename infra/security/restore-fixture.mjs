// A pg_dump/pg_restore rehearsal in the existing disposable CI container.
// Never accepts DATABASE_URL, a host name, database name or arbitrary commands.
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const container=process.env.NATIVE_POSTGRES_CONTAINER;
if(process.env.CONTINUA_DISPOSABLE_FIXTURE!=='true'||!/^[a-f0-9]{12,64}$/.test(container??''))throw Error('Dedicated disposable database container required');
function run(args){const r=spawnSync('docker',['exec',container,...args],{encoding:'utf8',timeout:30000,maxBuffer:2097152});if(r.status!==0)throw Error('Disposable restore check failed; raw database output omitted');return r.stdout.trim();}
const source='continua_native_fixture',destination='continua_restore_fixture',file='/tmp/continua-restore-fixture.dump';
const sql=(database,query)=>run(['psql','-U','postgres','-d',database,'-At','-v','ON_ERROR_STOP=1','-c',query]);
if(sql(source,'SELECT current_database()')!==source)throw Error('Refusing unrelated database');
if(sql(source,`SELECT count(*) FROM pg_database WHERE datname='${destination}'`)!=='0')throw Error('Restore target must not already exist');
const snapshot=`SELECT jsonb_build_object(
 'securities',(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM market.securities s),
 'quotes',(SELECT jsonb_agg(to_jsonb(q) ORDER BY q.security_id) FROM market.live_quotes q),
 'refresh',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.security_id) FROM market.native_research_refresh r),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.schemaname,p.tablename,p.policyname) FROM pg_policies p),
 'rls',(SELECT jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('market','scraping','public') AND c.relkind IN('r','p')))`;
const hash=value=>createHash('sha256').update(value).digest('hex');let created=false;
try{
 const before=hash(sql(source,snapshot));
 run(['pg_dump','-U','postgres','--format=custom','--file='+file,source]);
 run(['createdb','-U','postgres',destination]);created=true;
 run(['pg_restore','-U','postgres','--exit-on-error','--no-owner','--dbname='+destination,file]);
 if(hash(sql(destination,snapshot))!==before)throw Error('Restored rows, queue versions or security policies differ');
 console.log(JSON.stringify({backupRestore:'passed',fixtureOnly:true,productionDataCopied:false,securityPoliciesPreserved:true}));
}finally{
 if(created)run(['dropdb','-U','postgres',destination]);
 run(['rm','-f',file]);
}
