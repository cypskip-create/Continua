import {afterEach,test,expect,vi} from 'vitest';import express from 'express';
import {createManagedIdentityRouter,createTurnstileVerifier} from './managedRoutes.js';
const servers=[];afterEach(async()=>{await Promise.all(servers.splice(0).map(server=>new Promise(r=>server.close(r))));});
async function fixture(){
 const provider={call:vi.fn(),session:vi.fn(),cookies:vi.fn(()=>''),completeOAuth:vi.fn()},database={query:vi.fn(async()=>({rows:[]}))},broker={envelope:vi.fn(async()=>null),signOut:vi.fn()},verifyBot=vi.fn(async()=>{}),verifyAccess=vi.fn(async()=>{throw Error('Denied');});
 const app=express();app.use('/identity',createManagedIdentityRouter({database,broker,verifyBot,verifyAccess,providerFactory:()=>provider,publicOrigin:'https://continua.invalid',issuer:'https://managed.invalid',managedBaseURL:'https://managed.invalid/neondb/auth'}));
 const server=app.listen(0,'127.0.0.1');servers.push(server);await new Promise(r=>server.once('listening',r));
 return {provider,database,broker,verifyBot,async call(path,body,extra={}){const response=await fetch('http://127.0.0.1:'+server.address().port+'/identity/'+path,{method:body?'POST':'GET',headers:{Origin:'https://continua.invalid','X-Continua-Session':'1','Content-Type':'application/json',...extra},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()};}};
}
test('managed signup records legal intent only for the SDK-returned subject and issues no unverified session',async()=>{
 const f=await fixture();f.provider.call.mockResolvedValue({user:{id:'sdk-subject',emailVerified:false}});
 const input={email:'test@example.invalid',password:'test-password-123',name:'Test',userId:'forged-old-owner',acknowledgement:{adult_self_attested:true,terms_version:'2026-10-12',privacy_notice_version:'2026-10-12'}};
 const response=await f.call('signup',input);expect(response.status).toBe(200);expect(response.data).toEqual({session:null,verificationRequired:true});expect(f.database.query.mock.calls[0][1][1]).toBe('sdk-subject');expect(f.broker.envelope).not.toHaveBeenCalled();
 expect((await f.call('signup',{...input,acknowledgement:{}})).status).toBe(400);expect(f.provider.call).toHaveBeenCalledTimes(1);
});
test('managed logout has independent bot-free admission and confirms only successful broker sign-out',async()=>{
 const f=await fixture();expect((await f.call('signout',{})).data.signedOut).toBe(true);expect(f.verifyBot).not.toHaveBeenCalled();f.broker.signOut.mockRejectedValue(Error('Upstream failure'));expect((await f.call('signout',{})).status).toBe(503);
});
test('unsupported managed controls are explicit and foreign-origin requests cannot reach the SDK',async()=>{
 const f=await fixture();expect((await f.call('mfa-enable',{password:'test-password-123'})).status).toBe(409);expect((await f.call('email',{email:'new@example.invalid'})).status).toBe(409);expect((await f.call('signin',{email:'test@example.invalid',password:'test-password-123'},{Origin:'https://attacker.invalid'})).status).toBe(403);expect(f.provider.call).not.toHaveBeenCalled();
});
test('bot verification checks hostname and action and fails closed on provider errors',async()=>{
 const fetcher=vi.fn(async()=>Response.json({success:true,hostname:'continua.invalid',action:'continua-auth'}));const verify=createTurnstileVerifier({secret:'s'.repeat(32),origin:'https://continua.invalid',fetcher});await verify('test-token','127.0.0.1');
 fetcher.mockResolvedValue(Response.json({success:true,hostname:'attacker.invalid',action:'continua-auth'}));await expect(verify('test-token','127.0.0.1')).rejects.toThrow();fetcher.mockResolvedValue(Response.json({success:true,hostname:'continua.invalid',action:'wrong'}));await expect(verify('test-token','127.0.0.1')).rejects.toThrow();
});
test('Google initialization accepts only its configured managed endpoint and issues a server-side intent',async()=>{
 const f=await fixture();f.provider.call.mockResolvedValue({url:'https://managed.invalid/neondb/auth/sign-in/social/init?token=provider-initialization'});
 expect((await f.call('google',{signup:false})).status).toBe(200);expect(f.database.query.mock.calls[0][0]).toContain('managed_oauth_intents');
 for(const url of ['https://attacker.invalid/neondb/auth/sign-in/social/init?token=x','https://managed.invalid/otherdb/auth/sign-in/social/init?token=x','https://managed.invalid/neondb/auth/sign-in/social/init?token=x&token=y']){f.provider.call.mockResolvedValue({url});expect((await f.call('google',{signup:false})).status).toBe(503);}
});
test('OAuth callbacks require a one-use server intent even if a provider verifier is replayed',async()=>{
 const f=await fixture();expect((await f.call('oauth-complete',{verifier:'provider-verifier'})).status).toBe(401);expect(f.provider.completeOAuth).not.toHaveBeenCalled();
 let consumed=false;f.database.query.mockImplementation(async sql=>sql.startsWith('SELECT metadata')?{rows:[{metadata:{signup:false}}]}:{rows:[],rowCount:consumed?0:(consumed=true,1)});
 f.provider.session.mockResolvedValue({user:{id:'sdk-subject',emailVerified:true}});
 const headers={Cookie:'__Secure-continua.managed_registration='+'n'.repeat(43)};
 expect((await f.call('oauth-complete',{verifier:'provider-verifier',userId:'forged-owner'},headers)).status).toBe(200);
 expect((await f.call('oauth-complete',{verifier:'provider-verifier'},headers)).status).toBe(401);expect(f.broker.envelope).toHaveBeenCalledTimes(1);
});
