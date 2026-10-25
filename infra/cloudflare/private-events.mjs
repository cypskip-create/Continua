import {ownedProvider} from './auth-provider.mjs';
function denied(status,message){return Response.json({error:message},{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});}
export async function privateEvents(request,env){
 const url=new URL(request.url);if(url.pathname!=='/api/v1/events')return null;
 if(!ownedProvider(env))return denied(404,'Private subscriptions unavailable');
 if(request.method!=='GET'||request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return denied(426,'WebSocket upgrade required');
 if(url.search||request.headers.get('Origin')!==url.origin||request.headers.get('Sec-Fetch-Site')==='cross-site')return denied(403,'Subscription origin not allowed');
 const ip=request.headers.get('CF-Connecting-IP');if(!ip||ip.length>64)return denied(403,'Client identity unavailable');
 if(typeof env.BACKEND_API_KEY!=='string'||!env.BACKEND_API_KEY||typeof env.EDGE_ORIGIN_SECRET!=='string'||env.EDGE_ORIGIN_SECRET.length<32||env.EDGE_ORIGIN_SECRET.length>512||env.EDGE_ORIGIN_SECRET.trim()!==env.EDGE_ORIGIN_SECRET)return denied(503,'Subscription gateway unavailable');
 if(env.EDGE_RATE_LIMIT&&!(await env.EDGE_RATE_LIMIT.limit({key:ip})).success)return denied(429,'Too many subscription attempts');
 let target;try{target=new URL(env.BACKEND_ORIGIN);if(target.protocol!=='https:'||target.username||target.password||target.pathname!=='/'||target.search||target.hash)throw Error();target.pathname='/api/v1/events';}catch{return denied(503,'Subscription backend unavailable');}
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),55000);timer?.unref?.();
 try{
  const response=await fetch(target,{method:'GET',headers:{Upgrade:'websocket',Origin:url.origin,'X-API-Key':env.BACKEND_API_KEY,'X-Continua-Edge-Secret':env.EDGE_ORIGIN_SECRET,'X-Continua-Client-IP':ip},redirect:'manual',signal:controller.signal});
  if(response.status!==101||!response.webSocket||response.headers.has('Set-Cookie'))return denied(502,'Subscription connection failed');
  // Return the upgraded response itself; do not buffer frames or forward any
  // browser cookie, token header, query parameter or caller-provided API key.
  return response;
 }catch{return denied(502,'Subscription connection failed');}
 finally{clearTimeout(timer);}
}
