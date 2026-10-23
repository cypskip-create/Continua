import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {randomBytes} from 'node:crypto';
import {readStagingFixtureInputs} from './staging-fixture-inputs.mjs';
const {root,url}=readStagingFixtureInputs(),origin='https://localhost:5173';url.searchParams.set('sslmode','verify-full');
const progress=phase=>console.log(JSON.stringify({stagingHttpPhase:phase}));progress('configuration');
// This process listens only on an ephemeral loopback port. It never calls the
// production entrypoint or starts ingestion, renewal, email or scheduled jobs.
Object.assign(process.env,{DATABASE_URL:url.href,NODE_ENV:'test',LOG_LEVEL:'fatal',CACHE_DRIVER:'memory',CACHE_NAMESPACE:'continua:neon-staging-http-fixture',AUTH_PROVIDER:'better-auth',AUTH_PUBLIC_ORIGIN:origin,AUTH_EMAIL_ENABLED:'false',AUTH_TURNSTILE_SECRET:fs.readFileSync(path.join(root,'turnstile-existing.secret'),'utf8').trim(),BETTER_AUTH_SECRET:fs.readFileSync(path.join(root,'better-auth-staging.secret'),'utf8'),API_KEY_AUTH_ENABLED:'false',ALLOWED_ORIGINS:origin,ENGINE_MONITOR_ENABLED:'false',PAYSTACK_CARD_RENEWAL_ENABLED:'false',PAYSTACK_NATIVE_ENABLED:'false',PAYSTACK_LIVE_CHECKOUT_ENABLED:'false'});
const [{createServer},{getIdentityRuntime},{createContinuaAuth},{pool}]=await Promise.all([import('../../backend/src/api/server.js'),import('../../backend/src/auth/runtime.js'),import('../../backend/src/auth/continuaAuth.js'),import('../../backend/src/storage/db.js')]);
const runtime=getIdentityRuntime(),outbox=[],jar=new Map();
progress('full_backend_imported');
const fixtureAuth=createContinuaAuth({database:runtime.database,testOnly:true,baseURL:origin,trustedOrigins:[origin],secret:process.env.BETTER_AUTH_SECRET,sendMail:async message=>outbox.push(message)});
async function provider(endpoint,body){
 const response=await fixtureAuth.handler(new Request(endpoint.startsWith('https:')?endpoint:origin+'/api/auth/'+endpoint,{method:body?'POST':'GET',headers:{origin,'content-type':'application/json',cookie:[...jar].map(([key,value])=>key+'='+value).join('; ')},body:body?JSON.stringify(body):undefined}));
 for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],at=pair.indexOf('=');jar.set(pair.slice(0,at),pair.slice(at+1));}
 assert.ok([200,302].includes(response.status));return response.json().catch(()=>null);
}
const app=createServer(),server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
progress('loopback_listening');
assert.equal(server.address().address,'127.0.0.1');
const base=`http://127.0.0.1:${server.address().port}`,fetchOriginal=globalThis.fetch;let sourceHttpAttempts=0,userId,peakRss=process.memoryUsage().rss;
globalThis.fetch=(input,options)=>{const target=new URL(typeof input==='string'||input instanceof URL?input:input.url);if(target.hostname.endsWith('.supabase.co')){sourceHttpAttempts++;throw Error('Supabase HTTP is forbidden in this fixture');}return fetchOriginal(input,{...options,signal:options?.signal??AbortSignal.timeout(30000)});};
const memory=setInterval(()=>{peakRss=Math.max(peakRss,process.memoryUsage().rss);},50);memory.unref();
try{
 const email=`http-fixture-${Date.now()}@example.invalid`,password=randomBytes(24).toString('base64url');
 userId=(await provider('sign-up/email',{email,password,name:'Synthetic HTTP fixture'})).user.id;
 progress('synthetic_registration');
 await provider(outbox.at(-1).url);await provider('sign-in/email',{email,password});const token=(await provider('token')).token;
 progress('synthetic_login');
 const headers={Origin:origin,'X-User-Token':token};
 assert.equal((await fetch(base+'/api/v1/health/live')).status,200);
 assert.equal((await fetch(base+'/api/v1/engine/research-access/SCOM',{headers})).status,403);
 await runtime.database.query("UPDATE public.profiles SET subscription_plan='premium',subscription_expires_at=now()+interval '1 day' WHERE user_id=$1",[userId]);
 assert.equal((await fetch(base+'/api/v1/engine/research-access/SCOM',{headers})).status,200);
 progress('entitlement_checks');
 const timings=[];
 for(let i=0;i<12;i++){
  const start=performance.now(),response=await fetch(base+'/api/v1/data/profiles?select=user_id,full_name&user_id=eq.'+userId,{headers});
  assert.equal(response.status,200);const rows=await response.json();assert.equal(rows.length,1);assert.equal(rows[0].user_id,userId);timings.push(performance.now()-start);
 }
 assert.equal((await fetch(base+'/api/v1/data/profiles?select=user_id',{headers:{Origin:origin,'X-User-Token':'invalid-fixture'}})).status,401);
 const disabled=await fetch(base+'/api/v1/functions/stock-thesis',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}'});assert.equal(disabled.status,503);assert.equal((await disabled.json()).code,'PAID_AI_DISABLED');
 await provider('sign-out',{});assert.equal((await fetch(base+'/api/v1/engine/research-access/SCOM',{headers})).status,401);
 assert.equal(sourceHttpAttempts,0);assert.ok(peakRss<512*1024*1024,'Full API exceeds Render free memory budget');
 timings.sort((a,b)=>a-b);
 const receipt={stagingOnly:true,realEmailsSent:0,realPayments:0,scheduledJobsStarted:0,sourceHttpAttempts,fullApiHealth:true,freeEngineDenied:true,premiumEngineAllowed:true,ownerDataRead:true,invalidSessionDenied:true,logoutRevoked:true,paidAiDisabled:true,warmOwnerReadP95Ms:Math.round(timings[Math.ceil(timings.length*0.95)-1]),localPeakRssMiB:Math.ceil(peakRss/1048576),deployedResourceProof:false,productionChanged:false};
 fs.writeFileSync('.qa-artifacts/neon-migration/backend-http-receipt.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}finally{
 clearInterval(memory);globalThis.fetch=fetchOriginal;
 if(userId){await runtime.database.query("DELETE FROM app_identity.continua_auth_user WHERE id=$1 AND email LIKE 'http-fixture-%@example.invalid'",[userId]);await runtime.database.query("DELETE FROM app_identity.users WHERE id=$1 AND email LIKE 'http-fixture-%@example.invalid'",[userId]);}
 await new Promise(resolve=>server.close(resolve));await runtime.database.end();await pool.end();
}
