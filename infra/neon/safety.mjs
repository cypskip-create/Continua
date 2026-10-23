import {createHash} from 'node:crypto';

export const applicationSchemas=new Set(['public','market','scraping','migration_recovery','supabase_migrations','extensions']);

export function stagingConnection(value,manifest,expectedProject){
 const url=new URL(value.trim());
 const branch=manifest.branch;
 if(!['postgres:','postgresql:'].includes(url.protocol)||!url.username||!url.password||url.pathname!=='/neondb'||url.hash)throw Error('Invalid staging database connection');
 if(!branch||branch.project_id!==expectedProject||!branch.name.startsWith('continua-migration-staging-')||branch.name==='production')throw Error('A named migration staging branch is required');
 if(!url.hostname.endsWith('.neon.tech')||!manifest.endpoints?.some(endpoint=>endpoint.host===url.hostname&&endpoint.branch_id===branch.id))throw Error('Connection does not match the isolated staging endpoint');
 if(!['require','verify-full'].includes(url.searchParams.get('sslmode')))throw Error('TLS is required');
 return url;
}

export function libpqEnvironment(url,{certificate,applicationName},systemEnvironment){
 if(!certificate||!applicationName)throw Error('Explicit TLS certificate and operation name are required');
 const environment={};
 for(const key of ['PATH','SystemRoot','WINDIR','TEMP','TMP'])if(systemEnvironment[key])environment[key]=systemEnvironment[key];
 return {...environment,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:url.pathname.slice(1),PGSSLMODE:'verify-full',PGSSLROOTCERT:certificate,PGCONNECT_TIMEOUT:'15',PGAPPNAME:applicationName};
}

export function applicationRestoreList(toc){
 const extensions=new Set(['pgcrypto','uuid-ossp']);
 return toc.split(/\r?\n/).filter(line=>{
  if(line.startsWith(';'))return true;
  const match=/^\d+; \d+ \d+ (.+)$/.exec(line);if(!match)return false;
  const value=match[1];
  if(/^(ACL|DEFAULT ACL|PUBLICATION|SUBSCRIPTION|EVENT TRIGGER) /.test(value))return false;
  if(value.startsWith('SCHEMA - '))return applicationSchemas.has(value.split(' ')[2]);
  if(value.startsWith('EXTENSION - '))return extensions.has(value.split(' ')[2]);
  if(value.startsWith('COMMENT - EXTENSION '))return / (pgcrypto|uuid-ossp) /.test(value);
  if(value.startsWith('COMMENT - SCHEMA '))return applicationSchemas.has(value.split(' ')[3]);
  const object=/^(SEQUENCE OWNED BY|SEQUENCE SET|MATERIALIZED VIEW DATA|MATERIALIZED VIEW|TABLE DATA|TABLE ATTACH|INDEX ATTACH|FK CONSTRAINT|ROW SECURITY|FUNCTION|TYPE|DOMAIN|TABLE|SEQUENCE|VIEW|CONSTRAINT|INDEX|TRIGGER|RULE|POLICY|DEFAULT|COMMENT) (\S+) /.exec(value);
  return !!object&&applicationSchemas.has(object[2]);
 }).join('\n');
}

export function applicationDDL(sql,section){
 if(!['pre-data','post-data'].includes(section)||/^COPY .* FROM stdin;/mi.test(sql)||/^\\\.$/m.test(sql))throw Error('Only schema DDL may be rewritten; raw data must remain unchanged');
 return sql.replace(/\bauth\.users\b/g,'app_identity.users').replace(/\bauth\.mfa_factors\b/g,'app_identity.mfa_factors');
}

export function storagePath(bucket,name){
 if(!['scraper-raw','avatars','banners','post-images'].includes(bucket)||typeof name!=='string'||name.length>1024||name.split('/').some(part=>!part||part==='.'||part==='..'||/[\\\x00-\x1f]/.test(part)))throw Error('Invalid source storage path');
 return encodeURIComponent(bucket)+'/'+name.split('/').map(encodeURIComponent).join('/');
}

export function compareCounts(expected,actual){
 const key=row=>JSON.stringify([row.schema,row.table??row.name]);
 const values=new Map();for(const row of actual){if(values.has(key(row)))throw Error('Duplicate validation receipt');values.set(key(row),String(row.count??row.actual));}
 const missing=[],mismatched=[];
 for(const row of expected){const found=values.get(key(row));if(found===undefined)missing.push(key(row));else if(found!==String(row.count??row.expected))mismatched.push(key(row));values.delete(key(row));}
 return {matched:!missing.length&&!mismatched.length&&!values.size,missing,mismatched,unexpected:[...values.keys()]};
}

// Row JSON must be produced as text by PostgreSQL. Parsing NUMERIC through
// JavaScript before hashing would lose precision and invalidate this check.
export async function hashRows(rows){
 const digest=createHash('sha256');let count=0,bytes=0;
 for await(const row of rows){if(typeof row!=='string')throw Error('Exact PostgreSQL row text is required');const buffer=Buffer.from(row,'utf8');if(buffer.length>64*1024*1024)throw Error('Row exceeds bounded verification size');const length=Buffer.alloc(8);length.writeBigUInt64BE(BigInt(buffer.length));digest.update(length);digest.update(buffer);count++;bytes+=buffer.length;}
 return {count,bytes,sha256:digest.digest('hex')};
}

export function cutoverReadiness(receipts){
 const required=['backupRestored','databaseHashesMatch','constraintsMatch','identitiesMapped','existingUserLogin','newRegistration','emailVerification','passwordRecovery','sessionRenewal','logout','invalidSessionRejected','crossUserIsolation','mfaParity','emailChangeParity','storageVerified','engineParity','billingAndWebhookParity','collectorStaging','deploymentSmoke','resourceBudget','finalWriteFreezeAndSync','rollbackReconcilesNewWrites'];
 const blocked=required.filter(name=>receipts[name]!==true);
 return {ready:blocked.length===0,blocked};
}
