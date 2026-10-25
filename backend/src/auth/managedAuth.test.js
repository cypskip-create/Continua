import {test} from 'vitest';import assert from 'node:assert/strict';
import {generateKeyPair,exportJWK,SignJWT,createLocalJWKSet} from 'jose';
import {createManagedCookieVault} from './managedCrypto.js';
import {createManagedJwtVerifier,createManagedAccessVerifier} from './managedVerifier.js';
import {createManagedProvider} from './managedProvider.js';
import {validateManagedStaging} from './managedRuntime.js';

const baseURL='https://ep-purple-salad-b4qr5err.neonauth.c-6.us-east-2.aws.neon.tech/neondb/auth',issuer=new URL(baseURL).origin;
const clock=Date.parse('2026-10-24T18:00:00Z'),iat=clock/1000;
const keys=await generateKeyPair('EdDSA'),jwk={...await exportJWK(keys.publicKey),kid:'test',alg:'EdDSA'};
const verifyJwt=createManagedJwtVerifier({baseURL,now:()=>clock,jwks:createLocalJWKSet({keys:[jwk]})});
const signed=(patch={})=>new SignJWT({sub:'managed-subject',role:'authenticated',emailVerified:true,iat,exp:iat+900,iss:issuer,aud:issuer,...patch}).setProtectedHeader({alg:'EdDSA',kid:'test'}).sign(keys.privateKey);
test('managed JWT validation rejects wrong branch, audience, unverified, expired and excessive-lifetime tokens',async()=>{
 assert.equal((await verifyJwt(await signed())).sub,'managed-subject');
 for(const patch of [{iss:'https://wrong.invalid'},{aud:'continua'},{emailVerified:false},{banned:true},{role:'admin'},{exp:iat+901},{iat:iat-1000,exp:iat-100},{sub:''}])await assert.rejects(()=>signed(patch).then(verifyJwt));
});
test('encrypted opaque sessions reject tampering, other branch keys and malformed input',()=>{
 const vault=createManagedCookieVault('ab'.repeat(32),issuer),sealed=vault.seal('opaque');assert.equal(vault.open(sealed),'opaque');
 const damaged=Buffer.from(sealed,'base64url');damaged[28]^=1;assert.throws(()=>vault.open(damaged.toString('base64url')));
 assert.throws(()=>createManagedCookieVault('ab'.repeat(32),'https://other.invalid').open(sealed));assert.throws(()=>vault.open('short'));
});
test('live session checks bind canonical owner and deny logout, identity substitution and invalid expiry',async()=>{
 const vault=createManagedCookieVault('ab'.repeat(32),issuer),row={id:'canonical-owner',session_id:'local-session',issuer,subject:'managed-subject',managed_session_id:'provider-session',cookie_ciphertext:vault.seal('opaque'),password_verified_at:new Date(clock-1000),raw_user_meta_data:{}};
 let live={user:{id:'managed-subject',emailVerified:true},session:{id:'provider-session',expiresAt:new Date(clock+3600000)}};
 let bound=true,touches=0;const database={query:async sql=>sql.startsWith('SELECT')?{rows:bound?[row]:[]}:(touches++,{rowCount:1})};
 const access=createManagedAccessVerifier({database,verifyJwt,vault,issuer,now:()=>clock,readLiveSession:async cookie=>{assert.equal(cookie,'opaque');return live;}});
 const token=await signed(),identity=await access(token,{recent:true});assert.equal(identity.claims.sub,'canonical-owner');assert.equal(identity.claims.session_id,'local-session');assert.equal(touches,1);
 for(const invalid of [null,{...live,user:{id:'different-user',emailVerified:true}},{...live,session:{...live.session,expiresAt:'invalid'}},{...live,session:{...live.session,id:'another-session'}}]){live=invalid;await assert.rejects(()=>access(token));}assert.equal(touches,1);
 bound=false;await assert.rejects(()=>access(token));
});
test('managed candidate refuses production database or branch and missing opt-in',()=>{
 const config={DATABASE_URL:'postgresql://fixture@ep-purple-salad-b4qr5err.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require',AUTH_PUBLIC_ORIGIN:'https://localhost:5173',NEON_AUTH_BASE_URL:baseURL,NEON_AUTH_STAGING_ENABLED:true,NEON_AUTH_BRANCH_ID:'br-lively-paper-b4oli11a',NEON_AUTH_COOKIE_SECRET:'s'.repeat(32),NEON_AUTH_SESSION_KEY:'ab'.repeat(32)};
 assert.equal(validateManagedStaging(config).issuer,issuer);
 for(const patch of [{NEON_AUTH_STAGING_ENABLED:false},{NEON_AUTH_BRANCH_ID:'br-noisy-block-b4z5yxup'},{DATABASE_URL:config.DATABASE_URL.replace('ep-purple-salad-b4qr5err','ep-nameless-voice-b4ygobrp')},{AUTH_PUBLIC_ORIGIN:'https://continua.cypriankiprop41.workers.dev'}])assert.throws(()=>validateManagedStaging({...config,...patch}));
});
test('production managed runtime requires explicit opt-in and matching database, issuer and origin',()=>{
 const config={DATABASE_URL:'postgresql://fixture@ep-nameless-voice-b4ygobrp.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require',AUTH_PUBLIC_ORIGIN:'https://continua.cypriankiprop41.workers.dev',NEON_AUTH_BASE_URL:'https://ep-nameless-voice-b4ygobrp.neonauth.c-6.us-east-2.aws.neon.tech/neondb/auth',NEON_AUTH_PRODUCTION_ENABLED:true,NEON_AUTH_BRANCH_ID:'br-noisy-block-b4z5yxup',NEON_AUTH_COOKIE_SECRET:'p'.repeat(32),NEON_AUTH_SESSION_KEY:'cd'.repeat(32)};
 assert.equal(validateManagedStaging(config).issuer,new URL(config.NEON_AUTH_BASE_URL).origin);
 for(const patch of [{NEON_AUTH_PRODUCTION_ENABLED:false},{NEON_AUTH_STAGING_ENABLED:true},{NEON_AUTH_BRANCH_ID:'br-lively-paper-b4oli11a'},{NEON_AUTH_BASE_URL:baseURL},{AUTH_PUBLIC_ORIGIN:'https://localhost:5173'},{DATABASE_URL:config.DATABASE_URL.replace('ep-nameless-voice-b4ygobrp','ep-purple-salad-b4qr5err')}])assert.throws(()=>validateManagedStaging({...config,...patch}));
});
test('SDK adapter forces live reads and host-only Secure HttpOnly cookies without session-data caching',async()=>{
 const original=globalThis.fetch,cookies=[],calls=[];
 globalThis.fetch=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({session:{id:'s'},user:{id:'u'}}),{headers:{'Content-Type':'application/json','Set-Cookie':'__Secure-neon-auth.session_token=opaque; Domain=neon.tech; Path=/; HttpOnly; Secure; SameSite=None'}});};
 try{const provider=createManagedProvider({baseURL,cookieSecret:'s'.repeat(32),origin:'https://localhost:5173',cookie:'unrelated=secret; __Secure-neon-auth.session_token=old',onCookie:c=>cookies.push(c)});await provider.session();assert.equal(new URL(calls[0].url).searchParams.get('disableCookieCache'),'true');assert.equal(new Headers(calls[0].options.headers).get('cookie'),'__Secure-neon-auth.session_token=old');assert.match(cookies[0],/HttpOnly/);assert.match(cookies[0],/Secure/);assert.match(cookies[0],/SameSite=Lax/i);assert.doesNotMatch(cookies[0],/Domain=/i);assert.equal(provider.cookies(),'__Secure-neon-auth.session_token=opaque');}finally{globalThis.fetch=original;}
});
test('SDK traffic has bounded concurrency while ordinary page request bursts can queue',async()=>{
 const original=globalThis.fetch;let active=0,maximum=0;
 globalThis.fetch=async()=>{active++;maximum=Math.max(maximum,active);try{await new Promise(r=>setTimeout(r,5));return Response.json(null);}finally{active--;}};
 try{await Promise.all(Array.from({length:32},()=>createManagedProvider({baseURL,cookieSecret:'s'.repeat(32),origin:'https://localhost:5173'}).session()));assert.ok(maximum<=8);assert.ok(maximum>1);}finally{globalThis.fetch=original;}
});
test('timed-out SDK responses cannot write cookies after a request has ended',async()=>{
 const original=globalThis.fetch,cookies=[];let deliver;
 globalThis.fetch=()=>new Promise(r=>{deliver=r;});
 try{const provider=createManagedProvider({baseURL,cookieSecret:'s'.repeat(32),origin:'https://localhost:5173',timeoutMs:20,onCookie:c=>cookies.push(c)});await assert.rejects(()=>provider.session(),/timed out/);deliver(Response.json(null,{headers:{'Set-Cookie':'__Secure-neon-auth.session_token=late; Path=/; HttpOnly; Secure; SameSite=Lax'}}));await new Promise(r=>setTimeout(r,10));assert.equal(cookies.length,0);}finally{globalThis.fetch=original;}
});
