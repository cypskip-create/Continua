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
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  if(url.origin!==owned||!url.pathname.startsWith('/auth/v1/'))return fetcher(input,options);
  const headers=new Headers(options?.headers??(input instanceof Request?input.headers:undefined));
  headers.set('X-Continua-Session','1');
  // The gateway supplies its own publishable key; no caller-supplied key is trusted.
  headers.delete('apikey');
  return fetcher(site+'/api/session'+url.pathname+url.search,{...options,headers,credentials:'same-origin',cache:'no-store'});
 };
}
