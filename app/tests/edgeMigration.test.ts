import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

async function invoke(name:string,authorized=false){
 const code=readFileSync(new URL(`../../supabase/functions/${name}/index.js`,import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
 let handler:(r:Request)=>Promise<Response>|Response;let requests=0;
 vm.runInNewContext(code,{Request,Response,URL,AbortSignal,console,
  Deno:{env:{get:(key:string)=>key==='SUPABASE_URL'?'https://supabase.invalid':undefined},serve:(fn:typeof handler)=>handler=fn},
  createClient:()=>({auth:{getUser:async()=>({data:{user:authorized?{id:'fixture-user'}:null}})}}),
  fetch:async()=>{requests++;return Response.json({id:'fixture-user'});},
 });
 const headers:Record<string,string>={'Content-Type':'application/json'};if(authorized)headers.Authorization='Bearer fixture';
 const response=await handler!(new Request('https://edge.invalid',{method:'POST',headers,body:'{}'}));
 return {response,requests};
}
test('all migrated interactive Edge functions reject missing sessions before user changes or AI calls',async()=>{
 for(const name of ['ai-stock-analysis','stock-thesis','delete-account','check-price-alerts','check-indicator-alerts']){
  const result=await invoke(name);assert.equal(result.response.status,401,name);assert.equal(result.requests,0,name);
 }
});
test('legacy AI remains implemented but disabled without explicit funded-provider enablement',async()=>{
 for(const name of ['ai-stock-analysis','stock-thesis']){
  const result=await invoke(name,true);assert.equal(result.response.status,503,name);assert.ok(result.requests<=1,'Only Supabase auth validation can be called, not AI');
 }
});
test('retired checkout cannot grant unpaid access after migration',async()=>{
 const result=await invoke('upgrade-subscription');assert.equal(result.response.status,410);assert.equal(result.requests,0);
});
