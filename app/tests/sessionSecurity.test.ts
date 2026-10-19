import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionStorage,createSessionFetch} from '../src/lib/sessionTransport.ts';
import {clearPrivateSessionCache} from '../src/lib/privateSessionCache.ts';
test('only PKCE verifiers are persisted; session tokens remain in memory',()=>{
 const saved=new Map<string,string>();const store=createSessionStorage({getItem:k=>saved.get(k)??null,setItem:(k,v)=>{saved.set(k,v);},removeItem:k=>{saved.delete(k);}});
 store.setItem('sb-fixture-auth-token','private fixture session');store.setItem('sb-fixture-auth-token-code-verifier','fixture verifier');
 assert.equal(saved.has('sb-fixture-auth-token'),false);assert.equal(store.getItem('sb-fixture-auth-token'),'private fixture session');assert.equal(saved.size,1);
});
test('only owned Auth calls use cookie transport and other provider requests retain their URLs',async()=>{
 const calls:any[]=[];const transport=createSessionFetch('https://owned.supabase.co','https://site.workers.dev',async(url,options)=>{calls.push([String(url),options]);return Response.json({});});
 await transport('https://owned.supabase.co/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:'client-key'},body:'{}'});
 assert.equal(calls[0][0],'https://site.workers.dev/api/session/auth/v1/token?grant_type=password');assert.equal(calls[0][1].credentials,'same-origin');assert.equal(calls[0][1].headers.has('apikey'),false);
 await transport('https://owned.supabase.co/rest/v1/profiles');assert.equal(calls[1][0],'https://owned.supabase.co/rest/v1/profiles');
});
test('logout clears disposable private caches and legacy sessions without deleting journals or preferences',()=>{
 const values=new Map([['continua:portfolio:user','private'],['continua:company-engine:user:premium:NSE:KCB','private'],['sb-fixture-auth-token','session'],['continua:journal:v1:user:NSE:KCB','authored record'],['continua:chart-preferences','public preference']]);
 const storage={get length(){return values.size;},key:(i:number)=>[...values.keys()][i]??null,removeItem:(k:string)=>{values.delete(k);}};
 assert.equal(clearPrivateSessionCache(storage).removed,3);assert.equal(values.size,2);
});
