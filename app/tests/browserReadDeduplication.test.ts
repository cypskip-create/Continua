import test from 'node:test';import assert from 'node:assert/strict';import {createBrowserDataClient} from '../src/integrations/continua/browserDataClient.js';
test('identical in-flight reads share work only within the same verified session',async()=>{
 let token='first-session',release,started=0;const identity={getSession:async()=>({data:{session:{access_token:token}},error:null})};
 const client=createBrowserDataClient({origin:'https://continua.invalid',identity,fetcher:async()=>{started++;await new Promise(resolve=>{release=resolve});return Response.json([{id:started}]);}});
 const a=client.from('watchlists').select('*').execute(),b=client.from('watchlists').select('*').execute();await new Promise(resolve=>setImmediate(resolve));assert.equal(started,1);release();await Promise.all([a,b]);
 token='second-session';const c=client.from('watchlists').select('*').execute();await new Promise(resolve=>setImmediate(resolve));assert.equal(started,2);release();await c;
});
test('mutations are never deduplicated',async()=>{let started=0;const client=createBrowserDataClient({origin:'https://continua.invalid',identity:{getSession:async()=>({data:{session:null},error:null})},fetcher:async()=>{started++;return Response.json([]);}});await Promise.all([client.from('watchlists').insert({symbol:'A'}).execute(),client.from('watchlists').insert({symbol:'A'}).execute()]);assert.equal(started,2);});
