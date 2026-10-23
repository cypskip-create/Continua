// Owned auth gateway. Only this allowlist forwards authentication cookies.
// No raw provider surface, arbitrary upstream, cache, or automatic redirect.
const operations=new Set(['signin','google','signup','signout','recover','verify-password','mfa-enable','mfa-verify','mfa-disable','email','recovery-begin','reset-password']);
const reads=new Set(['session','factors','verify']);
const safeCookie=value=>/^__Secure-continua\.[a-z0-9_.-]+=[^;\r\n]*;/i.test(value)&&!/[\r\n]/.test(value)&&!/;\s*Domain=/i.test(value)&&/;\s*HttpOnly(?:;|$)/i.test(value)&&/;\s*Secure(?:;|$)/i.test(value)&&/;\s*Path=\/(?:;|$)/i.test(value)&&/;\s*SameSite=Lax(?:;|$)/i.test(value);
function reply(value,status=200){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','Pragma':'no-cache','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});}
async function bounded(stream,max){if(!stream)return new Uint8Array();const reader=stream.getReader(),parts=[];let bytes=0;try{for(;;){const item=await reader.read();if(item.done)break;bytes+=item.value.length;if(bytes>max)throw Error('size');parts.push(item.value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}const out=new Uint8Array(bytes);let offset=0;for(const part of parts){out.set(part,offset);offset+=part.length;}return out;}
export function ownedIdentityTarget(site,env,path,query=''){
 const target=new URL(env.BACKEND_ORIGIN);if(target.protocol!=='https:'||target.username||target.password||target.pathname!=='/'||target.search||target.hash)throw Error('Invalid backend');
 if(!env.BACKEND_API_KEY||typeof env.EDGE_ORIGIN_SECRET!=='string'||env.EDGE_ORIGIN_SECRET.length<32||env.EDGE_ORIGIN_SECRET.length>512)throw Error('Identity gateway not configured');
 target.pathname='/api/v1/identity/'+path;target.search=query;return target;
}
export async function ownedIdentity(request,env,fetcher=fetch){
 const url=new URL(request.url),isCallback=url.pathname.startsWith('/api/auth/'),isIdentity=url.pathname.startsWith('/api/v1/identity/');if(!isCallback&&!isIdentity)return null;
 if(env.AUTH_PROVIDER!=='better-auth')return reply({error:'Identity route unavailable'},404);
 const path=isCallback?url.pathname.slice('/api/auth/'.length):url.pathname.slice('/api/v1/identity/'.length);
 const callback=isCallback&&request.method==='GET'&&/^(?:verify-email|reset-password\/[A-Za-z0-9_-]{8,256}|callback\/google)$/.test(path);
 if(isCallback&&!callback||!isCallback&&!(request.method==='GET'&&reads.has(path)||request.method==='POST'&&operations.has(path)))return reply({error:'Identity route unavailable'},404);
 if(!callback&&((request.headers.get('Origin')!==url.origin&&!(request.headers.get('Origin')===null&&request.headers.get('Sec-Fetch-Site')==='same-origin'))||request.headers.get('Sec-Fetch-Site')==='cross-site'||request.headers.get('X-Continua-Session')!=='1'))return reply({error:'Origin not allowed'},403);
 if(request.url.length>16384)return reply({error:'Identity request too large'},413);
 if(!callback&&request.method==='POST'&&!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')??''))return reply({error:'JSON content type required'},415);
 const allowedQuery=callback?new Set(['token','callbackURL','callbackUrl','redirectTo','code','state','scope','authuser','prompt','error','error_description']):new Set(path==='verify'?['recent']:[]);
 for(const name of url.searchParams.keys())if(!allowedQuery.has(name)||url.searchParams.getAll(name).length!==1)return reply({error:'Invalid identity query'},400);
 const ip=request.headers.get('CF-Connecting-IP');if(!ip||ip.length>64||!env.AUTH_RATE_LIMIT)return reply({error:'Identity unavailable'},503);
 try{if(!(await env.AUTH_RATE_LIMIT.limit({key:ip})).success){const response=reply({error:'Too many attempts'},429);response.headers.set('Retry-After','60');return response;}}catch{return reply({error:'Identity unavailable'},503);}
 let target;try{target=ownedIdentityTarget(url.origin,env,callback?'provider/'+path:path,url.search);}catch{return reply({error:'Identity unavailable'},503);}
 const headers=new Headers({'Content-Type':'application/json','Origin':url.origin,'X-Continua-Session':'1','X-API-Key':env.BACKEND_API_KEY,'X-Continua-Edge-Secret':env.EDGE_ORIGIN_SECRET,'X-Continua-Client-IP':ip});
 for(const name of ['X-User-Token','User-Agent']){const value=request.headers.get(name);if(value)headers.set(name,value);}
 const cookies=(request.headers.get('Cookie')??'').split(';').map(s=>s.trim()).filter(s=>/^__Secure-continua\.[a-z0-9_.-]+=[^\s;,\r\n]*$/i.test(s));if(cookies.length>16||cookies.join('; ').length>16384)return reply({error:'Invalid identity cookies'},400);if(cookies.length)headers.set('Cookie',cookies.join('; '));
 let body;try{body=request.method==='POST'?await bounded(request.body,65536):undefined;}catch{return reply({error:'Identity request too large'},413);}
 let upstream;try{upstream=await fetcher(target,{method:request.method,headers,body,redirect:'manual',signal:AbortSignal.timeout(60000)});}catch{return reply({error:'Identity temporarily unavailable'},502);}
 const out=new Headers({'Cache-Control':'private, no-store','Pragma':'no-cache','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});
 const setCookies=upstream.headers.getSetCookie?.()??upstream.headers.getAll?.('Set-Cookie')??[];
 if(upstream.headers.has('Set-Cookie')&&!setCookies.length||setCookies.some(cookie=>cookie.length>16384||!safeCookie(cookie))){await upstream.body?.cancel();return reply({error:'Invalid identity response'},502);}
 for(const cookie of setCookies)out.append('Set-Cookie',cookie);
 if(upstream.status>=300&&upstream.status<400){let destination;try{destination=new URL(upstream.headers.get('Location'),url.origin);if(!callback||destination.origin!==url.origin||destination.username||destination.password)throw Error();}catch{await upstream.body?.cancel();return reply({error:'Invalid identity redirect'},502);}out.set('Location',destination.href);await upstream.body?.cancel();return new Response(null,{status:302,headers:out});}
 if(!/^application\/json(?:;|$)/i.test(upstream.headers.get('Content-Type')??'')){await upstream.body?.cancel();return reply({error:'Invalid identity response'},502);}
 let responseBody;try{responseBody=await bounded(upstream.body,131072);JSON.parse(new TextDecoder().decode(responseBody));}catch{return reply({error:'Invalid identity response'},502);}out.set('Content-Type','application/json');return new Response(responseBody,{status:upstream.status,headers:out});
}
