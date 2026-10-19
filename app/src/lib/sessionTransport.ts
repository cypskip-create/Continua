// Browser credentials persist on the owned gateway, never in web storage.
export const COOKIE_SESSION = 'cookie-session';
export function createSessionStorage(verifiers?:Pick<Storage,'getItem'|'setItem'|'removeItem'>) {
  const values=new Map<string,string>();
  return {getItem:(key:string)=>key.endsWith('-code-verifier')?verifiers?.getItem(key)??null:values.get(key)??null,
    setItem:(key:string,value:string)=>{if(key.endsWith('-code-verifier'))verifiers?.setItem(key,value);else values.set(key,value);},
    removeItem:(key:string)=>{values.delete(key);if(key.endsWith('-code-verifier'))verifiers?.removeItem(key);}};
}
export function createSessionFetch(provider:string,site:string,fetcher:typeof fetch=fetch):typeof fetch {
 const owned=new URL(provider).origin;
 return async(input,options)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,site);
  if(url.origin!==owned||!url.pathname.startsWith('/auth/v1/'))return fetcher(input,options);
  const headers=new Headers(options?.headers??(input instanceof Request?input.headers:undefined));
  headers.set('X-Continua-Session','1');
  // The gateway supplies its own publishable key; no caller-supplied key is trusted.
  headers.delete('apikey');
  // Use a plain header record across WebKit's fetch implementation as well.
  const requestHeaders:Record<string,string>={};headers.forEach((value,key)=>{requestHeaders[key]=value;});
  let response:Response;
  try {
   const target=new URL('/api/session'+url.pathname+url.search,site).href;
   const forwarded=input instanceof Request?new Request(target,input):target;
   response=await fetcher(forwarded,{
    ...options,headers:requestHeaders,credentials:'same-origin',cache:'no-store',
   });
  } catch(error) {
   if(options?.signal?.aborted||(input instanceof Request&&input.signal.aborted))throw error;
   return authTransportError('Sign-in could not reach the server. Check your connection, reload this page and try again.','auth_connection_failed');
  }
  if(response.status===204)return response;
  // A proxy/challenge HTML page must not become Safari's opaque JSON SyntaxError.
  if(response.headers.get('cf-mitigated')==='challenge'||!/application\/(?:[a-z0-9.+-]*\+)?json(?:;|$)/i.test(response.headers.get('Content-Type')??'')){
   await response.body?.cancel();
   return authTransportError('The sign-in service returned a browser verification page instead of a login response. Reload this page and retry verification.','auth_unexpected_response');
  }
  return response;
 };
}

function authTransportError(message:string,code:string){
 return new Response(JSON.stringify({error:message,error_code:code}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store'}});
}
