import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import pg from '../../backend/node_modules/pg/lib/index.js';
import {readStagingFixtureInputs} from './staging-fixture-inputs.mjs';
import {createContinuaAuth} from '../../backend/src/auth/continuaAuth.js';
import {createAccessVerifier} from '../../backend/src/auth/verifyAccess.js';
import {deleteOwnedAccount} from '../../backend/src/data/deleteAccount.js';

const {root,url}=readStagingFixtureInputs();
const database=new pg.Pool({connectionString:url.href,ssl:{rejectUnauthorized:true},max:2,statement_timeout:15000,options:'-c search_path=app_identity,public'});
const base='https://delete-fixture.invalid',outbox=[],jar=new Map();
const auth=createContinuaAuth({database,testOnly:true,secret:fs.readFileSync(path.join(root,'better-auth-staging.secret'),'utf8'),baseURL:base,trustedOrigins:[base],sendMail:async message=>outbox.push(message)});
const verify=createAccessVerifier({auth,database});let userId;
async function call(endpoint,body){
 const response=await auth.handler(new Request(endpoint.startsWith('https:')?endpoint:base+'/api/auth/'+endpoint,{method:body?'POST':'GET',headers:{origin:base,'content-type':'application/json',cookie:[...jar].map(([key,value])=>key+'='+value).join('; ')},body:body?JSON.stringify(body):undefined}));
 for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],at=pair.indexOf('=');jar.set(pair.slice(0,at),pair.slice(at+1));}
 const result=await response.json().catch(()=>null);assert.ok([200,302].includes(response.status));return result;
}
try{
 const originalCount=(await database.query("SELECT count(*)::int count FROM app_identity.users WHERE source_provider='supabase'")).rows[0].count;
 const email=`delete-fixture-${Date.now()}@example.invalid`,password=randomBytes(24).toString('base64url');
 userId=(await call('sign-up/email',{email,password,name:'Disposable deletion fixture'})).user.id;
 await call(outbox.at(-1).url);await call('sign-in/email',{email,password});
 const token=(await call('token')).token,identity=await verify(token);
 await database.query("INSERT INTO public.room_messages(room_id,user_id,content) SELECT id,$1,'Disposable deletion fixture' FROM public.rooms LIMIT 1",[userId]);
 await database.query("INSERT INTO public.muted_keywords(user_id,keyword) VALUES($1,'disposable-fixture')",[userId]);
 await assert.rejects(()=>deleteOwnedAccount({database,identity,body:{confirmation:'DELETE',accountId:'00000000-0000-4000-8000-000000000000'}}),error=>error.status===400);
 assert.equal((await database.query('SELECT count(*)::int count FROM app_identity.continua_auth_user WHERE id=$1',[userId])).rows[0].count,1);
 await deleteOwnedAccount({database,identity,body:{confirmation:'DELETE',accountId:userId}});
 for(const table of ['app_identity.users','app_identity.continua_auth_user'])assert.equal((await database.query(`SELECT count(*)::int count FROM ${table} WHERE id=$1`,[userId])).rows[0].count,0);
 for(const table of ['public.profiles','public.muted_keywords','public.room_messages'])assert.equal((await database.query(`SELECT count(*)::int count FROM ${table} WHERE user_id=$1`,[userId])).rows[0].count,0);
 assert.equal((await database.query('SELECT count(*)::int count FROM app_identity.account_media_cleanup WHERE user_id=$1 AND completed_at IS NULL',[userId])).rows[0].count,1);
 await assert.rejects(()=>verify(token));
 assert.equal((await database.query("SELECT count(*)::int count FROM app_identity.users WHERE source_provider='supabase'")).rows[0].count,originalCount);
 const receipt={stagingOnly:true,originalUsersChanged:0,realEmailsSent:0,wrongOwnerRejected:true,identityAndNonCascadeRowsRemoved:true,sessionRevoked:true,mediaCleanupDurable:true,allPassed:true};
 fs.writeFileSync('.qa-artifacts/neon-migration/account-delete-fixture-receipt.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}finally{
 if(userId){
  await database.query("DELETE FROM app_identity.continua_auth_user WHERE id=$1 AND email LIKE 'delete-fixture-%@example.invalid'",[userId]);
  await database.query("DELETE FROM app_identity.users WHERE id=$1 AND email LIKE 'delete-fixture-%@example.invalid'",[userId]);
  // Only this fixture's newly generated UUID; there are no real media objects.
  await database.query('DELETE FROM app_identity.account_media_cleanup WHERE user_id=$1',[userId]);
 }
 await database.end();
}
