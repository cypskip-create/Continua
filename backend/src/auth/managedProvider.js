import {createAuthServer,extractNeonAuthCookies,serializeSetCookie,resolveNeonAuthLogging,processAuthMiddleware} from '@neondatabase/auth/server';
let upstreamInFlight=0;
const upstreamQueue=[];
function reserveUpstream(signal){
 return new Promise((resolve,reject)=>{
  const entry={grant(){signal.removeEventListener('abort',cancel);upstreamInFlight++;resolve(()=>{upstreamInFlight--;upstreamQueue.shift()?.grant();});}};
  const cancel=()=>{const at=upstreamQueue.indexOf(entry);if(at>=0)upstreamQueue.splice(at,1);reject(Object.assign(Error('Managed authentication timed out'),{status:503}));};
  if(signal.aborted)return cancel();
  if(upstreamInFlight<8)entry.grant();else{if(upstreamQueue.length>=64)return reject(Object.assign(Error('Managed authentication is busy'),{status:503}));upstreamQueue.push(entry);signal.addEventListener('abort',cancel,{once:true});}
 });
}
// Keep timed-out SDK work counted until the underlying request settles.
// The beta toolkit currently does not forward a caller's AbortSignal.
async function boundedUpstream(work,onTimeout,timeoutMs){
 let timer;const controller=new AbortController();
 const pending=reserveUpstream(controller.signal).then(async release=>{try{return await work();}finally{release();}});
 try{return await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>{onTimeout();controller.abort();reject(Object.assign(Error('Managed authentication timed out'),{status:503}));},timeoutMs);timer.unref?.();})]);}finally{clearTimeout(timer);}
}

// Official SDK server toolkit adapter. Each instance owns one request's cookie
// jar; no request context or provider credential is shared across users.
export function createManagedProvider({baseURL,cookieSecret,origin,cookie='',onCookie=()=>{},timeoutMs=20000}){
 let expired=false;
 const jar=new Map(extractNeonAuthCookies(new Headers({cookie})).split(';').map(s=>s.trim()).filter(s=>s&&!s.split('=')[0].includes('session_data')).map(s=>{const at=s.indexOf('=');return [s.slice(0,at),s.slice(at+1)];}));
 const config={baseUrl:baseURL,cookieSecret,sessionDataTtl:1,sameSite:'lax',log:resolveNeonAuthLogging({logLevel:'silent'})};
 function accept(name,value,options){
  if(expired)return;
  if(!/^__Secure-neon-auth\.[a-z0-9_.-]+$/i.test(name)||options.domain)throw Error('Unsafe managed cookie');
  // Never use or expose the SDK's local session-data cache as authentication.
  if(name.includes('session_data'))return;
  const serialized=serializeSetCookie({name,value,...options,domain:undefined,path:'/',httpOnly:true,secure:true,sameSite:'lax'});
  if(options.maxAge===0)jar.delete(name);else jar.set(name,value);
  onCookie(serialized);
 }
 const cookies=()=>[...jar].map(([k,v])=>k+'='+v).join('; ');
 const auth=createAuthServer({...config,context:()=>({getCookies:cookies,setCookie:accept,getHeader:name=>name.toLowerCase()==='origin'?origin:null,getOrigin:()=>origin,getFramework:()=>'express'})});
 async function call(method,body){
  if(expired)throw Object.assign(Error('Managed request expired'),{status:503});
  const action=method.split('.').reduce((value,key)=>value[key],auth);
  const result=await boundedUpstream(()=>action(body),()=>{expired=true;},timeoutMs);
  if(result.error){const error=Error(result.error.message??'Managed authentication rejected the request');error.status=Number(result.error.status)||400;error.code=result.error.code;throw error;}
  return result.data;
 }
 return {call,cookies,session:()=>call('getSession',{query:{disableCookieCache:'true'}}),
  async completeOAuth(verifier){
   if(!/^[A-Za-z0-9_.~-]{8,2048}$/.test(verifier??''))throw Error('Invalid OAuth verifier');
   const url=new URL('/managed-callback',origin);url.searchParams.set('neon_auth_session_verifier',verifier);
   const result=await boundedUpstream(()=>processAuthMiddleware({...config,request:new Request(url,{headers:{cookie:cookies(),origin}}),pathname:url.pathname,skipRoutes:[],loginUrl:'/auth'}),()=>{expired=true;},timeoutMs);
   if(result.action!=='redirect_oauth')throw Error('OAuth session could not be verified');
   for(const serialized of result.cookies){
    if(!/^__Secure-neon-auth\.[a-z0-9_.-]+=/i.test(serialized)||/;\s*Domain=/i.test(serialized)||!/;\s*HttpOnly(?:;|$)/i.test(serialized)||!/;\s*Secure(?:;|$)/i.test(serialized))throw Error('Unsafe OAuth cookie');
    if(serialized.includes('session_data'))continue;
    const pair=serialized.split(';')[0],at=pair.indexOf('=');if(/;\s*Max-Age=0(?:;|$)/i.test(serialized))jar.delete(pair.slice(0,at));else jar.set(pair.slice(0,at),pair.slice(at+1));onCookie(serialized);
   }
  }};
}
