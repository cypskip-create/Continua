import test from 'node:test';
import assert from 'node:assert/strict';
import {stagingConnection,libpqEnvironment,applicationRestoreList,applicationDDL,storagePath,compareCounts,hashRows,cutoverReadiness} from './safety.mjs';

const manifest={branch:{id:'br-fixture',name:'continua-migration-staging-fixture',project_id:'fixture-project'},endpoints:[{host:'ep-fixture.us-east-2.aws.neon.tech',branch_id:'br-fixture'}]};
const fixtureUrl='postgresql://fixture:synthetic-not-real@ep-fixture.us-east-2.aws.neon.tech/neondb?sslmode=verify-full';
test('restore requires the exact staging branch, project, endpoint and TLS',()=>{
 assert.equal(stagingConnection(fixtureUrl,manifest,'fixture-project').hostname,manifest.endpoints[0].host);
 for(const value of [fixtureUrl.replace('ep-fixture','ep-production'),fixtureUrl.replace('verify-full','disable'),fixtureUrl.replace('/neondb','/postgres')])assert.throws(()=>stagingConnection(value,manifest,'fixture-project'));
 assert.throws(()=>stagingConnection(fixtureUrl,{...manifest,branch:{...manifest.branch,name:'production'}},'fixture-project'));
 assert.throws(()=>stagingConnection(fixtureUrl,manifest,'another-project'));
});
test('libpq subprocess receives only its own database credential and TLS settings',()=>{
 const env=libpqEnvironment(new URL(fixtureUrl),{certificate:'fixture-ca.pem',applicationName:'fixture-only'},{PATH:'fixture-bin',PAYSTACK_SECRET_KEY:'must-not-inherit',OPENAI_API_KEY:'must-not-inherit',R2_SECRET_ACCESS_KEY:'must-not-inherit'});
 assert.equal(env.PGSSLMODE,'verify-full');assert.equal(env.PGCONNECT_TIMEOUT,'15');assert.equal(env.PGPASSWORD,'synthetic-not-real');assert.equal(env.PAYSTACK_SECRET_KEY,undefined);assert.equal(env.R2_SECRET_ACCESS_KEY,undefined);
});
test('portable restore excludes managed auth/storage, external services and publication hooks',()=>{
 const result=applicationRestoreList(['1; 2615 1 SCHEMA - market postgres','2; 2615 2 SCHEMA - auth supabase_admin','3; 0 1 TABLE DATA market prices postgres','4; 0 2 TABLE DATA auth users supabase_admin','5; 0 3 TABLE DATA storage objects supabase_storage_admin','6; 3079 4 EXTENSION - pg_net ','7; 3079 5 EXTENSION - pgcrypto ','8; 0 4 PUBLICATION - internal postgres','9; 0 5 ACL public TABLE profiles postgres','10; 0 6 TABLE DATA supabase_migrations schema_migrations postgres'].join('\n'));
 assert.match(result,/market prices/);assert.match(result,/pgcrypto/);assert.match(result,/supabase_migrations/);assert.doesNotMatch(result,/auth users|SCHEMA - auth|storage objects|pg_net|PUBLICATION|ACL/);
});
test('identity references change only in the schema transformation stage',()=>{
 assert.equal(applicationDDL('REFERENCES auth.users(id); SELECT * FROM auth.mfa_factors;','post-data'),'REFERENCES app_identity.users(id); SELECT * FROM app_identity.mfa_factors;');
 assert.throws(()=>applicationDDL('COPY public.money FROM stdin;\n1\t9999999999999999.001\n\\.','data'));
 assert.throws(()=>applicationDDL('COPY public.money FROM stdin;','pre-data'));
});

test('portable restore retains separately archived unvalidated check constraints',()=>{
 const toc='4711; 2606 35950 CHECK CONSTRAINT public blocked_users no_self_block postgres';
 assert.equal(applicationRestoreList(toc),toc);
 assert.equal(applicationRestoreList(toc.replace('public blocked_users','auth users')),'');
});
test('storage paths are encoded once and reject traversal and cross-bucket reads',()=>{
 assert.equal(storagePath('scraper-raw','issuer/2026/report name.pdf'),'scraper-raw/issuer/2026/report%20name.pdf');
 for(const value of ['../private','issuer/../private','issuer\\private','issuer//private','issuer/\0private'])assert.throws(()=>storagePath('scraper-raw',value));
 assert.throws(()=>storagePath('unknown','file'));
});
test('count validation cannot pass missing, additional, changed or duplicate tables',()=>{
 const expected=[{schema:'public',table:'holdings',count:'16'}];assert.equal(compareCounts(expected,[{schema:'public',table:'holdings',count:16}]).matched,true);
 for(const actual of [[],[{schema:'public',table:'holdings',count:'15'}],[{schema:'public',table:'holdings',count:'16'},{schema:'public',table:'other',count:'0'}]])assert.equal(compareCounts(expected,actual).matched,false);
 assert.throws(()=>compareCounts(expected,[...expected,...expected]));
});
test('row hashes preserve decimal precision, timestamp text, null and row boundaries',async()=>{
 const a=await hashRows(['{"amount":9999999999999999.001,"at":"2026-10-22T00:00:00.123456+00:00","missing":null}']);
 const b=await hashRows(['{"amount":9999999999999999.002,"at":"2026-10-22T00:00:00.123456+00:00","missing":null}']);assert.notEqual(a.sha256,b.sha256);
 assert.notEqual((await hashRows(['ab','c'])).sha256,(await hashRows(['a','bc'])).sha256);await assert.rejects(hashRows([{amount:1}]));
});
test('creating a database or importing rows cannot satisfy the production cutover gate',()=>{
 const result=cutoverReadiness({backupRestored:true,databaseHashesMatch:true,identitiesMapped:true});assert.equal(result.ready,false);assert.ok(result.blocked.includes('existingUserLogin'));assert.ok(result.blocked.includes('storageVerified'));assert.ok(result.blocked.includes('finalWriteFreezeAndSync'));assert.ok(result.blocked.includes('mfaParity'));assert.ok(result.blocked.includes('rollbackReconcilesNewWrites'));
});
