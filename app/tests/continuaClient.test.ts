import test from 'node:test';
import assert from 'node:assert/strict';
import {createContinuaClient} from '../src/integrations/continua/client.js';

const token='header.payload.signature';
const session={access_token:token,refresh_token:'cookie-session',expires_at:Math.floor(Date.now()/1000)+300,user:{id:'91f4a30f-d8ca-45c1-a941-829838dc5fd0'}};
test('owned client shares one restored identity with its authorized data transport',async()=>{
 const calls:any[]=[];
 const client=createContinuaClient({origin:'https://continua.invalid',fetcher:async(url:any,options:any)=>{
  calls.push({url,options});
  return Response.json(url.endsWith('/session')?{session,mfaRequired:false}:[{id:'fixture'}]);
 }});
 try{
  await client.auth.restoreSession();
  assert.deepEqual((await client.from('watchlists').select()).data,[{id:'fixture'}]);
  assert.equal(calls.length,2);
  assert.equal(calls[1].options.headers['X-User-Token'],token);
  assert.ok(calls.every(call=>new URL(call.url).origin==='https://continua.invalid'));
 }finally{client.destroy();}
});

test('pending challenge stays separate from data authorization and cancellation clears it',async()=>{
 const calls:any[]=[];
 const client=createContinuaClient({origin:'https://continua.invalid',fetcher:async(url:any,options:any)=>{
  calls.push({url,options});
  if(url.endsWith('/session'))return Response.json({session:null,mfaRequired:true});
  return Response.json(url.endsWith('/signout')?{signedOut:true}:[]);
 }});
 try{
  await client.auth.restoreSession();
  assert.equal(client.auth.getSecurityState().mfaPending,true);
  await client.from('posts').select();
  assert.equal(calls.at(-1).options.headers['X-User-Token'],undefined);
  await client.auth.signOut();
  assert.equal(client.auth.getSecurityState().mfaPending,false);
  assert.equal((await client.auth.getSession()).data.session,null);
 }finally{client.destroy();}
});
