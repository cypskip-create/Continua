import {ownedIdentity} from './identity.mjs';
// Public application images only. Financial evidence has no binding here.
const MAX_BYTES=5*1024*1024;
const UUID='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const KIND='(?:avatars|banners|post-images)';
const OBJECT=new RegExp(`^(${KIND})/(${UUID})/(${UUID})-([a-f0-9]{64})\\.(jpg|png|webp|gif)$`);
const UPLOAD=new RegExp(`^/api/v1/media/(${KIND})$`);
const TYPES={jpg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif'};
const EXISTING_SITES=new Set(['https://continua-delta.vercel.app','https://continua-cypskip-creates-projects.vercel.app']);
export function imageFormat(bytes){
 if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'jpg';
 if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))return 'png';
 const ascii=(start,end)=>String.fromCharCode(...bytes.subarray(start,end));
 if(bytes.length>=12&&ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP')return 'webp';
 if(bytes.length>=6&&['GIF87a','GIF89a'].includes(ascii(0,6)))return 'gif';
 return null;
}
async function bounded(stream,maximum){
 if(!stream)return new Uint8Array();
 const reader=stream.getReader(),parts=[];let total=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>maximum)throw Error('size');parts.push(value);}}
 catch(error){await reader.cancel().catch(()=>{});throw error;}
 finally{reader.releaseLock();}
 const data=new Uint8Array(total);let offset=0;for(const part of parts){data.set(part,offset);offset+=part.length;}return data;
}
export async function media(request,env,security){
 const url=new URL(request.url),upload=UPLOAD.exec(url.pathname);
 const origin=request.headers.get('Origin'),allowedOrigin=origin===url.origin||EXISTING_SITES.has(origin);
 const responseSecurity={...security,...(allowedOrigin?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{})};
 const isPublic=url.pathname.startsWith('/media/'),deletion=url.pathname.startsWith('/api/v1/media/object/')?OBJECT.exec(url.pathname.slice('/api/v1/media/object/'.length)):null;
 if(!isPublic&&!url.pathname.startsWith('/api/v1/media/'))return null;
 const respond=(message,status)=>new Response(JSON.stringify({error:message}),{status,headers:{...responseSecurity,'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(!env.MEDIA_BUCKET||env.MEDIA_STORAGE_ENABLED!=='true')return respond('Media storage unavailable',503);
 if(isPublic){
  const key=url.pathname.slice('/media/'.length),match=OBJECT.exec(key);
  if(!match||url.search)return respond('Image not found',404);
  if(!['GET','HEAD'].includes(request.method))return respond('Method not allowed',405);
  try{
   const object=request.method==='HEAD'?await env.MEDIA_BUCKET.head(key):await env.MEDIA_BUCKET.get(key);
   if(!object)return respond('Image not found',404);
   if(!Number.isInteger(object.size)||object.size<1||object.size>MAX_BYTES){await object.body?.cancel();return respond('Image unavailable',503);}
   return new Response(request.method==='HEAD'?null:object.body,{headers:{...security,'Access-Control-Allow-Origin':'*','Content-Type':TYPES[match[5]],'Content-Length':String(object.size),'ETag':object.httpEtag,'Cache-Control':'public, max-age=3600','Content-Security-Policy':"default-src 'none'; sandbox"}});
  }catch{return respond('Image unavailable',503);}
 }
 if(!allowedOrigin)return respond('Origin not allowed',403);
 if(request.method==='OPTIONS'&&(upload||deletion)&&!url.search)return new Response(null,{status:204,headers:{...responseSecurity,'Access-Control-Allow-Methods':'POST, DELETE, OPTIONS','Access-Control-Allow-Headers':'Content-Type, X-User-Token','Access-Control-Max-Age':'600','Cache-Control':'no-store'}});
 if(url.search||!(upload&&request.method==='POST'||deletion&&request.method==='DELETE'))return respond('Media route unavailable',404);
 const token=request.headers.get('X-User-Token');
 if(!token||token.length>8192)return respond('Sign in required',401);
 const ip=request.headers.get('CF-Connecting-IP');
 if(!ip||ip.length>64||!env.MEDIA_RATE_LIMIT||env.AUTH_PROVIDER!=='better-auth')return respond('Media storage unavailable',503);
 try{if(!(await env.MEDIA_RATE_LIMIT.limit({key:ip})).success)return new Response(JSON.stringify({error:'Too many uploads'}),{status:429,headers:{...responseSecurity,'Content-Type':'application/json','Cache-Control':'no-store','Retry-After':'60'}});}
 catch{return respond('Media storage unavailable',503);}
 const declared=request.headers.get('Content-Length');
 if(declared&&(!/^\d+$/.test(declared)||Number(declared)>MAX_BYTES))return respond('Maximum image size is 5 MB',413);
 let owner;
 try{
  // Never trust a decoded browser JWT or a user-supplied issuer/owner/path.
  const owned=env.AUTH_PROVIDER==='better-auth';
  const auth=await ownedIdentity(new Request(url.origin+'/api/v1/identity/verify',{headers:{Origin:url.origin,'X-Continua-Session':'1','X-User-Token':token,'CF-Connecting-IP':ip}}),env);
  if(!auth.ok){await auth.body?.cancel();return respond(auth.status>=500?'Authentication unavailable':'Sign in required',auth.status>=500?503:401);}
  const result=JSON.parse(new TextDecoder().decode(await bounded(auth.body,65536))),user=result.user;
  if(typeof user?.id!=='string'||!new RegExp('^'+UUID+'$').test(user.id)||user.is_anonymous===true)return respond('Sign in required',401);
  if(result.claims?.sub!==user.id||result.claims?.role!=='authenticated'||result.claims?.aud!=='continua')return respond('Sign in required',401);
  owner=user.id;
 }catch{return respond('Authentication unavailable',503);}
 if(deletion){
  if(deletion[2]!==owner)return respond('Image owner required',403);
  try{await env.MEDIA_BUCKET.delete(url.pathname.slice('/api/v1/media/object/'.length));return new Response(null,{status:204,headers:{...responseSecurity,'Cache-Control':'no-store'}});}
  catch{return respond('Image removal unavailable',503);}
 }
 let bytes;
 try{bytes=await bounded(request.body,MAX_BYTES);}catch{return respond('Maximum image size is 5 MB',413);}
 const extension=imageFormat(bytes),type=request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
 if(!extension||TYPES[extension]!==type)return respond('Use a JPEG, PNG, WebP or GIF image',415);
 const hash=await crypto.subtle.digest('SHA-256',bytes),hex=Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');
 const key=`${upload[1]}/${owner}/${crypto.randomUUID()}-${hex}.${extension}`;
 try{
  await env.MEDIA_BUCKET.put(key,bytes,{sha256:hash,httpMetadata:{contentType:TYPES[extension]},customMetadata:{owner,kind:upload[1],sha256:hex}});
  return new Response(JSON.stringify({url:url.origin+'/media/'+key}),{status:201,headers:{...responseSecurity,'Content-Type':'application/json','Cache-Control':'no-store'}});
 }catch{return respond('Image upload unavailable',503);}
}
