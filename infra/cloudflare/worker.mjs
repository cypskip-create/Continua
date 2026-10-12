const security={"X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY","Referrer-Policy":"no-referrer","Strict-Transport-Security":"max-age=31536000","Permissions-Policy":"camera=(self), microphone=(self), geolocation=()","Content-Security-Policy":"frame-ancestors 'none'; base-uri 'self'; object-src 'none'"};
export const publicTtl=path=>/\/api\/v1\/(quotes|indices)(?:\/|$)/.test(path)?5:/\/api\/v1\/(instruments|sectors)(?:\/|$)/.test(path)?60:0;
export function upstreamUrl(requestUrl,origin){
 const input=new URL(requestUrl),upstream=new URL(origin);
 if(upstream.protocol!=='https:'||upstream.username||upstream.password||upstream.pathname!=='/'||upstream.search||upstream.hash)throw new Error('Invalid upstream origin');
 let decoded;try{decoded=decodeURIComponent(input.pathname);}catch{throw new Error('Invalid route encoding');}
 if(!input.pathname.startsWith('/api/v1/')||/%(?:2f|5c|25|00)/i.test(input.pathname)||/\/admin(?:\/|$)|\/billing\/paystack\/webhook/i.test(decoded))throw new Error('Restricted gateway route');
 upstream.pathname=input.pathname;upstream.search=input.search;return upstream;
}
export async function boundedBody(request,max=512*1024){
 if(!request.body)return undefined;
 const reader=request.body.getReader(),chunks=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw new Error('Request too large');}chunks.push(value);}
 const body=new Uint8Array(size);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}return body;
}
function reply(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...security}});}
export default {async fetch(request,env){
 const url=new URL(request.url),id=crypto.randomUUID();
 if(!url.pathname.startsWith('/api/')) {
  const asset=await env.ASSETS.fetch(request),headers=new Headers(asset.headers);
  for(const [name,value]of Object.entries(security))headers.set(name,value);
  // Auth and checkout HTML must never be retained as a user-specific document.
  if(/^\/(?:checkout|auth)(?:\/|$)/.test(url.pathname))headers.set('Cache-Control','no-store');
  return new Response(asset.body,{status:asset.status,headers});
 }
 if(!['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'].includes(request.method))return reply({error:'Method not allowed'},405);
 const origin=request.headers.get('Origin');
 if(origin&&origin!==url.origin)return reply({error:'Origin not allowed'},403);
 if(request.headers.get('Sec-Fetch-Site')==='cross-site')return reply({error:'Cross-site request not allowed'},403);
 if(['POST','PUT','PATCH'].includes(request.method)&&!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')??''))return reply({error:'JSON content type required'},415);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':url.origin,'Access-Control-Allow-Methods':'GET, HEAD, POST, PUT, PATCH, DELETE','Access-Control-Allow-Headers':'Content-Type, X-User-Token, X-Supabase-Key, X-API-Key','Cache-Control':'no-store',...security}});
 let target;try{target=upstreamUrl(url,env.BACKEND_ORIGIN);}catch{return reply({error:'Route unavailable'},404);}
 const limiter=url.pathname.startsWith('/api/v1/billing/')?env.PAYMENT_RATE_LIMIT:env.EDGE_RATE_LIMIT;
 if(limiter){const key=request.headers.get('CF-Connecting-IP');if(!key)return reply({error:'Client identity unavailable'},403);const result=await limiter.limit({key});if(!result.success)return new Response(JSON.stringify({error:'Too many requests'}),{status:429,headers:{'Content-Type':'application/json','Retry-After':'60','Cache-Control':'no-store',...security}});}
 const headers=new Headers();
 for(const name of ['Content-Type','Accept','X-User-Token','X-Supabase-Key','If-None-Match']){const value=request.headers.get(name);if(value)headers.set(name,value);}
 if(env.BACKEND_API_KEY)headers.set('X-API-Key',env.BACKEND_API_KEY);else return reply({error:'Gateway credentials not configured'},503);
 headers.set('X-Request-ID',id);
 let body;try{body=await boundedBody(request);}catch{return reply({error:'Request too large'},413);}
 const started=Date.now();let response;
 try{response=await fetch(target,{method:request.method,headers,body,redirect:'manual',signal:AbortSignal.timeout(60000)});}catch{return reply({error:'Upstream unavailable',requestId:id},502);}
 // Public HTTP caching remains OFF during workers.dev verification. User and
 // payment data never enter a shared edge cache, even when requested by GET.
 const out=new Headers(response.headers);for(const [name,value]of Object.entries(security))out.set(name,value);
 out.delete('Set-Cookie');out.delete('Location');out.set('Cache-Control','no-store');out.set('X-Request-ID',id);out.set('Server-Timing',`upstream;dur=${Date.now()-started}`);
 if(response.status>=300&&response.status<400&&response.status!==304)return reply({error:'Unexpected upstream redirect',requestId:id},502);
 return new Response(response.body,{status:response.status,headers:out});
}};
