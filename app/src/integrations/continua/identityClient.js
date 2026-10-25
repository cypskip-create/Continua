// Same-origin identity transport. Only a short-lived access JWT lives in memory;
// the provider session remains in a host-only, HttpOnly cookie.
export function createIdentityClient({origin,fetcher=fetch,now=Date.now,location=()=>globalThis.location,replaceUrl=url=>globalThis.history?.replaceState(null,'',url),channel}={}){
 const site=new URL(origin);if(site.origin!==origin||site.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(site.hostname))throw Error('An owned HTTPS origin is required');
 let session=null,pendingMfa=false,recoveryToken=null,oauthVerifier=null,restoring=null,signingOut=null,timer,failures=0,destroyed=false,revision=0,restored=false,checkedAt=0,recoveryStarted=false;const listeners=new Set(),securityListeners=new Set();
 const security=()=>({mfaPending:pendingMfa,recoveryMode:!!recoveryToken});
 function publish(event){for(const listener of listeners){try{Promise.resolve(listener(event,session)).catch(()=>{});}catch{}}for(const listener of securityListeners){try{listener(security());}catch{}}}
 function schedule(delay){clearTimeout(timer);if(destroyed||!session)return;timer=setTimeout(()=>void refresh(),delay??Math.max(5000,session.expires_at*1000-now()-30000));timer?.unref?.();}
 function assign(value,event='TOKEN_REFRESHED'){
  if(destroyed)throw Error('Identity client is closed');
  if(value!==null&&(!value?.user?.id||!Number.isFinite(value.expires_at)||typeof value.access_token!=='string'||value.access_token.length>16384||value.access_token.split('.').length!==3||value.refresh_token!=='cookie-session'))throw Error('Invalid identity response');
  const previous=session;session=value;restored=true;checkedAt=now();failures=0;if(value)pendingMfa=false;schedule();publish(value?previous?.user.id===value.user.id?event:'SIGNED_IN':previous?'SIGNED_OUT':'INITIAL_SESSION');
 }
 async function call(path,body){
  const response=await fetcher(origin+'/api/v1/identity/'+path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json','X-Continua-Session':'1',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});
  if(!/^application\/json(?:;|$)/i.test(response.headers.get('Content-Type')??'')){await response.body?.cancel();throw Error('Sign-in service returned an unexpected response. Reload and retry verification.');}
  const reader=response.body?.getReader();if(!reader)throw Error('Identity response unavailable');const parts=[];let size=0;try{for(;;){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>131072)throw Error('Identity response too large');parts.push(item.value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}const data=JSON.parse(new TextDecoder().decode(bytes));if(!response.ok)throw Object.assign(new Error(data.error??'Identity request could not complete'),{status:response.status,code:data.code});return data;
 }
 const result=async work=>{try{return {data:await work(),error:null};}catch(error){return {data:{session:null,user:null},error:error instanceof Error?error:new Error('Identity request could not complete')};}};
 function consumeRecoveryUrl(){const current=location();if(!current?.href)return;const url=new URL(current.href),fragment=new URLSearchParams(url.hash.slice(1));if(url.origin!==origin||!url.searchParams.has('token')&&!fragment.has('recovery_token'))return;const token=fragment.get('recovery_token')??url.searchParams.get('token');url.searchParams.delete('token');fragment.delete('recovery_token');url.hash=fragment.toString();replaceUrl(url.pathname+url.search+url.hash);if(/^[A-Za-z0-9_-]{8,256}$/.test(token??'')){recoveryToken=token;recoveryStarted=false;revision++;}}
 function consumeOAuthUrl(){const current=location();if(!current?.href)return;const url=new URL(current.href);if(url.origin!==origin||!url.searchParams.has('neon_auth_session_verifier'))return;const values=url.searchParams.getAll('neon_auth_session_verifier');url.searchParams.delete('neon_auth_session_verifier');replaceUrl(url.pathname+url.search+url.hash);if(values.length===1&&/^[A-Za-z0-9_.~-]{8,2048}$/.test(values[0]))oauthVerifier=values[0];}
 async function refresh(){
  if(signingOut)return signingOut.then(({error})=>({data:{session,user:session?.user??null},error}));
  if(restoring)return restoring;
  const startedAtRevision=revision;
  restoring=result(async()=>{try{const data=await call('session');if(startedAtRevision!==revision)return {session,user:session?.user??null,mfaRequired:pendingMfa};pendingMfa=data.mfaRequired===true;assign(data.session??null);if(recoveryToken){if(!recoveryStarted){const pending=await call('recovery-begin',{token:recoveryToken});if(startedAtRevision!==revision)return {session,user:session?.user??null,mfaRequired:pendingMfa};recoveryStarted=true;pendingMfa=pending.mfaRequired===true;}publish('PASSWORD_RECOVERY');}return {session,user:session?.user??null,mfaRequired:pendingMfa};}catch(error){if(startedAtRevision!==revision)throw error;if(error.status===401){pendingMfa=false;assign(null);}else{failures++;schedule(Math.min(60000,10000*failures));}throw error;}}).finally(()=>{restoring=null;});return restoring;
 }
 async function sessionOperation(path,body){if(signingOut)throw Error('Sign-out is in progress');const operationRevision=++revision;const data=await call(path,body);if(operationRevision!==revision)throw Error('Identity request was superseded');pendingMfa=data.mfaRequired===true;if(Object.hasOwn(data,'session')){assign(data.session);if(data.session)channel?.postMessage({type:'session-changed'});}else publish('USER_UPDATED');return {...data,user:session?.user??null};}
 const auth={
  getSession:async()=>{
   // A refresh must not stall every data read while the current JWT is still
   // valid. Server signature, expiry, live-session and SQL guards still run.
   if(session&&session.expires_at*1000>now()){
    if(session.expires_at*1000-now()<=30000&&!restoring)void refresh();
    return {data:{session},error:null};
   }
   return !session&&restored&&now()-checkedAt<30000?{data:{session},error:null}:refresh();
  },
  refreshSession:()=>refresh(),
  restoreSession:()=>result(async()=>{consumeRecoveryUrl();consumeOAuthUrl();if(oauthVerifier){const data=await sessionOperation('oauth-complete',{verifier:oauthVerifier});oauthVerifier=null;return data;}const current=await refresh();if(current.error)throw current.error;return current.data;}),
  onAuthStateChange:listener=>{listeners.add(listener);queueMicrotask(()=>{if(listeners.has(listener)){try{Promise.resolve(listener('INITIAL_SESSION',session)).catch(()=>{});}catch{}}});return {data:{subscription:{unsubscribe:()=>listeners.delete(listener)}}};},
  onSecurityStateChange:listener=>{securityListeners.add(listener);listener(security());return ()=>securityListeners.delete(listener);},
  getSecurityState:security,
  signInWithPassword:({email,password,options={}})=>result(()=>sessionOperation('signin',{email,password,captchaToken:options.captchaToken})),
  signUp:({email,password,options={}})=>result(()=>sessionOperation('signup',{email,password,name:options.data?.full_name,acknowledgement:options.data,captchaToken:options.captchaToken})),
  resetPasswordForEmail:(email,options={})=>result(()=>call('recover',{email,captchaToken:options.captchaToken})),
  signInWithGoogle:options=>result(()=>call('google',options)),
  signOut:()=>{
   if(signingOut)return signingOut;
   signingOut=result(async()=>{++revision;clearTimeout(timer);const data=await call('signout',{});if(data.signedOut!==true)throw Error('Sign-out was not confirmed. Please retry.');pendingMfa=false;recoveryToken=null;assign(null);channel?.postMessage({type:'signed-out'});return {};}).finally(()=>{signingOut=null;if(session)schedule();});
   return signingOut;
  },
  updateUser:values=>result(async()=>{if(values.password){const operationRevision=++revision;if(!recoveryToken)throw Error('Open a fresh password recovery link first');const data=await call('reset-password',{token:recoveryToken,password:values.password});if(operationRevision!==revision)throw Error('Identity request was superseded');recoveryToken=null;pendingMfa=false;assign(null);return data;}if(values.email)return call('email',{email:values.email});throw Error('Identity change unavailable');}),
  reauthenticate:()=>result(async()=>{throw Error('Request a fresh password recovery link instead of an email confirmation code');}),
  setSession:()=>result(async()=>{throw Error('Only the owned server can establish an identity session');}),
  mfa:{
   listFactors:()=>result(async()=>{const data=await call('factors');return {all:data.factors,totp:data.factors.filter(f=>f.factor_type==='totp'),phone:[]};}),
   enroll:options=>result(()=>call('mfa-enable',{password:options.password})),
   unenroll:options=>result(()=>sessionOperation('mfa-disable',{password:options.password})),
   challengeAndVerify:({code})=>result(()=>sessionOperation('mfa-verify',{code})),
   getAuthenticatorAssuranceLevel:()=>result(async()=>{const current=await auth.getSession();if(current.error)throw current.error;let claims={};if(session)claims=JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));return {currentLevel:claims.aal??'aal1',nextLevel:pendingMfa||session?.user?.factors?.some(f=>f.status==='verified')?'aal2':'aal1',currentAuthenticationMethods:claims.amr??[]};})
  }
 };
 const onMessage=event=>{if(destroyed)return;if(event.data?.type==='signed-out'){revision++;pendingMfa=false;recoveryToken=null;oauthVerifier=null;assign(null);}else if(event.data?.type==='session-changed'){revision++;void(async()=>{if(restoring)await restoring;if(!destroyed&&!signingOut)await refresh();})().catch(()=>{});}};channel?.addEventListener('message',onMessage);
 return {auth,destroy:()=>{destroyed=true;revision++;clearTimeout(timer);session=null;recoveryToken=null;pendingMfa=false;listeners.clear();securityListeners.clear();channel?.removeEventListener('message',onMessage);}};
}
