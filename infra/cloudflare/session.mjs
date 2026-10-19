// Same-origin Auth transport. Refresh credentials live only in a host-only,
// HttpOnly cookie; short-lived access tokens remain in the browser's memory.
const origin='https://jjsetogmnumoudrovpzn.supabase.co';
export const marker='cookie-session';
const cookieName='__Host-continua-refresh';
const tokenPattern=/^[A-Za-z0-9_-]{8,2048}$/;
const cookie=(token,clear=false)=>`${cookieName}=${clear?'':token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${clear?0:2592000}`;
const hint=(clear=false)=>`continua_session=${clear?'':'1'}; Path=/; Secure; SameSite=Strict; Max-Age=${clear?0:2592000}`;
function reply(value,status=200){return new Response(value===null?null:JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});}
function attach(response,token,clear=false){response.headers.append('Set-Cookie',cookie(token,clear));response.headers.append('Set-Cookie',hint(clear));return response;}
function readCookie(request){const values=(request.headers.get('Cookie')??'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(cookieName+'='));if(values.length!==1)return null;const token=values[0].slice(cookieName.length+1);return tokenPattern.test(token)?token:null;}
function permitted(path,method){
 if(path==='/clear')return method==='POST';
 if(/^\/auth\/v1\/(?:token|signup|recover|resend|verify|logout|sso)$/.test(path))return method==='POST';
 if(path==='/auth/v1/user')return method==='GET'||method==='PUT';
 if(path==='/auth/v1/reauthenticate')return method==='GET';
 if(path==='/auth/v1/factors')return method==='GET'||method==='POST';
 if(/^\/auth\/v1\/factors\/[a-f0-9-]{36}$/.test(path))return method==='DELETE';
 return /^\/auth\/v1\/factors\/[a-f0-9-]{36}\/(?:challenge|verify)$/.test(path)&&method==='POST';
}
async function jsonBody(request){
 if(!request.body)return null;
 const reader=request.body.getReader();let size=0;const parts=[];
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();throw Error('body_limit');}parts.push(value);}
 const bytes=new Uint8Array(size);let n=0;for(const part of parts){bytes.set(part,n);n+=part.length;}
 const value=JSON.parse(new TextDecoder().decode(bytes));if(!value||Array.isArray(value)||typeof value!=='object')throw Error('invalid_body');return value;
}
async function readJSON(response,max=131072){
 const reader=response.body?.getReader();if(!reader)throw Error('empty_response');let size=0;const parts=[];
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw Error('response_limit');}parts.push(value);}
 const bytes=new Uint8Array(size);let n=0;for(const part of parts){bytes.set(part,n);n+=part.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
// Called only after the Auth provider validates this exact bearer token.
export function stepUpAllowed(claims,user,now=Date.now()){
 if(claims?.sub!==user?.id)return false;
 if(user.factors?.some(f=>f.status==='verified')&&claims.aal!=='aal2')return false;
 return Array.isArray(claims.amr)&&claims.amr.some(a=>['password','oauth','otp','recovery','webauthn','mfa/totp','mfa/phone','mfa/webauthn'].includes(a.method)&&Number.isFinite(a.timestamp)&&a.timestamp*1000<=now+30000&&now-a.timestamp*1000<=600000);
}
export async function session(request,env,fetcher=fetch){
 const url=new URL(request.url);if(!url.pathname.startsWith('/api/session/'))return null;
 const path=url.pathname.slice('/api/session'.length);
 if(!permitted(path,request.method))return reply({error:'Session route unavailable'},404);
 // Every request, including GET /user, is a same-origin browser fetch. No
 // navigation, cross-origin form, CORS permission or client API key grants access.
 if((request.headers.get('Origin')!==url.origin&&!(request.headers.get('Origin')===null&&request.headers.get('Sec-Fetch-Site')==='same-origin'))||request.headers.get('X-Continua-Session')!=='1'||request.headers.get('Sec-Fetch-Site')==='cross-site')return reply({error:'Origin not allowed'},403);
 if(path==='/clear')return attach(reply({cleared:true}),'',true);
 if(!env.SUPABASE_PUBLISHABLE_KEY)return reply({error:'Session service unavailable'},503);
 if(env.AUTH_RATE_LIMIT){const ip=request.headers.get('CF-Connecting-IP');if(!ip)return reply({error:'Client identity unavailable'},403);if(!(await env.AUTH_RATE_LIMIT.limit({key:ip})).success){const r=reply({error:'Too many attempts. Please retry shortly.'},429);r.headers.set('Retry-After','60');return r;}}
 const target=new URL(origin+path);
 const allowed=new Set(['grant_type','redirect_to','scope']);
 for(const [name,value]of url.searchParams){if(!allowed.has(name)||url.searchParams.getAll(name).length!==1)return reply({error:'Invalid session query'},400);target.searchParams.set(name,value);}
 if(target.searchParams.has('redirect_to')){try{if(new URL(target.searchParams.get('redirect_to')).origin!==url.origin)throw Error();}catch{return reply({error:'Invalid return address'},400);}}
 let body;try{body=await jsonBody(request);}catch{return reply({error:'Invalid session request'},400);}
 if(path==='/auth/v1/token'){
  const grant=target.searchParams.get('grant_type');
  if(!['password','refresh_token','pkce','id_token'].includes(grant))return reply({error:'Invalid session grant'},400);
  if(grant==='refresh_token'){
   // A valid legacy refresh credential can be migrated once; the actual token
   // is never returned to JavaScript or persisted there again.
   const token=readCookie(request)??(tokenPattern.test(body?.refresh_token??'')&&body.refresh_token!==marker?body.refresh_token:null);
   if(!token)return attach(reply({error:'Session expired',error_code:'refresh_token_not_found'},401),'',true);
   body={...body,refresh_token:token};
  }
 }
 const headers=new Headers({'apikey':env.SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'});
 const authorization=request.headers.get('Authorization');if(authorization&&/^Bearer [A-Za-z0-9._-]{1,8192}$/.test(authorization))headers.set('Authorization',authorization);
 const sensitive=path==='/auth/v1/user'&&request.method==='PUT'&&(body?.password||body?.email)||path==='/auth/v1/factors'&&request.method==='POST'||request.method==='DELETE';
 if(sensitive){
  try{
   if(!headers.has('Authorization'))return reply({error:'Verify a recent sign-in first'},403);
   const check=await fetcher(origin+'/auth/v1/user',{headers,redirect:'manual',signal:AbortSignal.timeout(10000)});
   if(!check.ok)return reply({error:'Sign in again to continue'},401);
   const user=await readJSON(check,65536),raw=authorization.split(' ')[1].split('.')[1];
   const claims=JSON.parse(atob(raw.replace(/-/g,'+').replace(/_/g,'/')));
   if(!stepUpAllowed(claims,user))return reply({error:'Verify a recent sign-in and any enabled authenticator before this change',error_code:'recent_authentication_required'},403);
  }catch{return reply({error:'Recent sign-in could not be verified'},503);}
 }
 let upstream;try{upstream=await fetcher(target,{method:request.method,headers,body:body?JSON.stringify(body):undefined,redirect:'manual',signal:AbortSignal.timeout(15000)});}catch{return reply({error:'Session service unavailable'},503);}
 if(upstream.status>=300&&upstream.status<400)return reply({error:'Unexpected session redirect'},502);
 if(upstream.status===204)return path==='/auth/v1/logout'?attach(reply(null,204),'',true):reply(null,204);
 let value;try{value=await readJSON(upstream,path==='/auth/v1/factors'&&request.method==='POST'?1048576:131072);}catch{return reply({error:'Invalid session response'},502);}
 let refresh=null;
 for(const candidate of [value,value?.session])if(candidate&&typeof candidate==='object'&&typeof candidate.refresh_token==='string'){
  if(upstream.ok&&tokenPattern.test(candidate.refresh_token)){refresh=candidate.refresh_token;candidate.refresh_token=marker;}
  else delete candidate.refresh_token;
 }
 const result=reply(value,upstream.status);
 if(refresh)return attach(result,refresh);
 if(path==='/auth/v1/logout'&&upstream.ok||path==='/auth/v1/token'&&target.searchParams.get('grant_type')==='refresh_token'&&[400,401].includes(upstream.status))return attach(result,'',true);
 return result;
}
