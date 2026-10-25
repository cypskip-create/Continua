import test from 'node:test';import assert from 'node:assert/strict';
import {createIdentityClient} from '../src/integrations/continua/identityClient.js';
const origin='https://continua.invalid',id='11111111-1111-4111-8111-111111111111';
test('a still-valid JWT serves reads during a slow refresh; expired or revoked tokens do not',async t=>{
 let clock=Date.now(),deliver:any,calls=0;const expected=session();
 const f=fixture(t,()=>++calls===1?Response.json({session:expected}):new Promise(resolve=>{deliver=resolve;}),{now:()=>clock});
 await f.auth.restoreSession();clock=expected.expires_at*1000-20000;
 const current=await f.auth.getSession();assert.equal(current.data.session.access_token,expected.access_token);assert.equal(calls,2);
 clock=expected.expires_at*1000+1;let resolved=false;const expired=f.auth.getSession().then(value=>{resolved=true;return value;});await Promise.resolve();assert.equal(resolved,false);
 deliver(Response.json({error:'revoked'},{status:401}));assert.ok((await expired).error);assert.equal((await f.auth.getSession()).data.session,null);
});
function session(){const exp=Math.floor(Date.now()/1000)+300;return {access_token:'header.'+Buffer.from(JSON.stringify({exp,aal:'aal1',amr:[]})).toString('base64url')+'.signature',refresh_token:'cookie-session',expires_at:exp,user:{id,email:'fixture@example.invalid',factors:[]}};}
function fixture(t:any,handler:(path:string,body:any)=>any,extra:any={}){const calls:any[]=[];const client=createIdentityClient({origin,location:()=>undefined,fetcher:async(url:any,options:any)=>{const path=new URL(url).pathname.split('/').at(-1);const body=options.body?JSON.parse(options.body):undefined;calls.push({url,options,body});return handler(path,body);},...extra});t.after(()=>client.destroy());return {...client,calls};}
test('managed OAuth verifier leaves browser history before the same-origin SDK exchange',async t=>{
 let cleaned='',href=origin+'/auth?neon_auth_session_verifier=staging-verifier-123&keep=value';
 const expected=session(),f=fixture(t,(path,body)=>{assert.equal(cleaned,'/auth?keep=value');assert.equal(path,'oauth-complete');assert.equal(body.verifier,'staging-verifier-123');return Response.json({session:expected});},{location:()=>({href}),replaceUrl:(url:string)=>{cleaned=url;href=origin+url;}});
 const restored=await f.auth.restoreSession();assert.equal(restored.error,null);assert.deepEqual(restored.data.session,expected);assert.equal(f.calls.some(c=>c.url.includes('staging-verifier')),false);
});
test('another tab refreshes its in-memory token after sign-in changes without broadcasting credentials',async t=>{
 let receive:any;const posts:any[]=[];let current=session();
 const f=fixture(t,()=>Response.json({session:current}),{channel:{postMessage:(data:any)=>posts.push(data),addEventListener:(_name:string,listener:any)=>{receive=listener;},removeEventListener:()=>{}}});
 await f.auth.restoreSession();current={...session(),access_token:session().access_token.replace('.signature','.replacement')};
 receive({data:{type:'session-changed'}});await f.auth.refreshSession();assert.equal((await f.auth.getSession()).data.session.access_token,current.access_token);assert.deepEqual(posts,[]);
 await f.auth.signInWithPassword({email:'fixture@example.invalid',password:'fixture-password'});assert.deepEqual(posts,[{type:'session-changed'}]);
});
test('restores only a short-lived JWT and opaque cookie marker without browser storage',async t=>{const expected=session();const f=fixture(t,()=>Response.json({session:expected}));const restored=await f.auth.restoreSession();assert.deepEqual(restored.data.session,expected);await f.auth.getSession();assert.equal(f.calls.length,1);assert.equal(f.calls[0].options.credentials,'same-origin');assert.equal(f.calls[0].options.headers['X-Continua-Session'],'1');assert.equal(f.calls[0].options.cache,'no-store');assert.equal(f.calls[0].options.body,undefined);});
test('rejects a raw provider credential instead of saving it as a browser session',async t=>{const f=fixture(t,()=>Response.json({session:{...session(),refresh_token:'opaque-provider-secret'}}));const result=await f.auth.restoreSession();assert.ok(result.error);assert.equal(f.auth.getSecurityState().mfaPending,false);});
test('pending MFA never fabricates an authenticated user or access token',async t=>{const f=fixture(t,path=>Response.json(path==='signin'?{session:null,mfaRequired:true}:{session:null}));const result=await f.auth.signInWithPassword({email:'fixture@example.invalid',password:'fixture-password',options:{captchaToken:'fixture-captcha'}});assert.equal(result.data.session,null);assert.equal(result.data.user,null);assert.equal(f.auth.getSecurityState().mfaPending,true);assert.equal((await f.auth.getSession()).data.session,null);assert.equal(f.calls[0].body.captchaToken,'fixture-captcha');});
test('late session restoration cannot resurrect a signed-out user',async t=>{let deliver:any;const f=fixture(t,path=>path==='session'?new Promise(resolve=>{deliver=resolve;}):Response.json({signedOut:true}));const pending=f.auth.restoreSession();await f.auth.signOut();deliver(Response.json({session:session()}));await pending;assert.equal((await f.auth.getSession()).data.session,null);});
test('recovery tokens leave browser history and remain in memory only until reset',async t=>{let cleaned='';const token='fixture-recovery-token';const f=fixture(t,path=>Response.json(path==='session'?{session:null}:path==='recovery-begin'?{mfaRequired:true}:path==='mfa-verify'?{session:session()}:{updated:true}),{location:()=>({href:origin+'/auth?token='+token+'&keep=value'}),replaceUrl:(url:string)=>{cleaned=url;}});await f.auth.restoreSession();assert.equal(cleaned,'/auth?keep=value');assert.deepEqual(f.auth.getSecurityState(),{mfaPending:true,recoveryMode:true});assert.equal(f.calls.some(c=>c.url.includes(token)),false);assert.equal(f.calls.filter(c=>c.url.endsWith('/recovery-begin')).length,1);await f.auth.mfa.challengeAndVerify({code:'123456'});await f.auth.updateUser({password:'new-fixture-password'});assert.equal(f.calls.find(c=>c.url.endsWith('/reset-password')).body.token,token);assert.deepEqual(f.auth.getSecurityState(),{mfaPending:false,recoveryMode:false});assert.equal((await f.auth.getSession()).data.session,null);});
test('transport errors remain actionable and do not claim a session exists',async t=>{const f=fixture(t,()=>new Response('<html>challenge</html>',{headers:{'Content-Type':'text/html'}}));const result=await f.auth.signInWithPassword({email:'fixture@example.invalid',password:'fixture-password'});assert.match(result.error.message,/unexpected response/);assert.equal(result.data.session,null);});

test('fragment recovery credentials never enter network URLs or remain in browser history',async t=>{let cleaned='';const token='fixture-fragment-recovery-token';const f=fixture(t,path=>Response.json(path==='session'?{session:null}:{mfaRequired:false}),{location:()=>({href:origin+'/auth#recovery_token='+token}),replaceUrl:(url:string)=>{cleaned=url;}});await f.auth.restoreSession();assert.equal(cleaned,'/auth');assert.equal(f.auth.getSecurityState().recoveryMode,true);assert.equal(f.calls.find(c=>c.url.endsWith('/recovery-begin')).body.token,token);assert.equal(f.calls.some(c=>c.url.includes(token)),false);});

test('repeated sign-out clicks share one request and wait for confirmed revocation',async t=>{
 let finish:any;const messages:any[]=[];
 const f=fixture(t,path=>path==='signout'?new Promise(resolve=>{finish=resolve;}):Response.json({session:session()}),{channel:{postMessage:(value:any)=>messages.push(value),addEventListener:()=>{},removeEventListener:()=>{}}});
 await f.auth.restoreSession();
 const first=f.auth.signOut(),second=f.auth.signOut();
 assert.equal(first,second);
 const restoring=f.auth.restoreSession();
 assert.equal(f.calls.filter(c=>c.url.endsWith('/signout')).length,1);
 assert.equal(f.calls.filter(c=>c.url.endsWith('/session')).length,1);
 assert.ok((await f.auth.getSession()).data.session);
 finish(Response.json({signedOut:true}));
 assert.equal((await first).error,null);assert.equal((await second).error,null);
 assert.equal((await restoring).data.session,null);
 assert.equal((await f.auth.getSession()).data.session,null);
 assert.deepEqual(messages,[{type:'signed-out'}]);
});

test('failed sign-out keeps the session and permits a successful retry',async t=>{
 let attempts=0;const f=fixture(t,path=>path==='signout'?++attempts===1?Response.json({error:'Too many attempts'},{status:429}):Response.json({signedOut:true}):Response.json({session:session()}));
 await f.auth.restoreSession();
 assert.equal((await f.auth.signOut()).error.status,429);
 assert.ok((await f.auth.getSession()).data.session);
 assert.equal((await f.auth.signOut()).error,null);
 assert.equal((await f.auth.getSession()).data.session,null);
});

test('an unconfirmed sign-out never clears the local session',async t=>{
 const f=fixture(t,path=>Response.json(path==='signout'?{}:{session:session()}));await f.auth.restoreSession();
 assert.match((await f.auth.signOut()).error.message,/not confirmed/);
 assert.ok((await f.auth.getSession()).data.session);
});
