import test from 'node:test';
import assert from 'node:assert/strict';
import { researchAccessState,sessionRestoreMessage } from '../src/lib/accountAccess.ts';

test('a failed bootstrap connection is retryable while confirmed revocation returns to sign-in',()=>{
 for(const error of [Error('offline'),{status:503},{status:429}])assert.match(sessionRestoreMessage(error)??'',/connection could not be restored/);
 assert.equal(sessionRestoreMessage({status:401}),null);
});
test('unresolved or failed accounts never become a free-tier upsell',()=>{
  assert.equal(researchAccessState({signedIn:true,loading:true,hasProfile:false}),'loading');
  assert.equal(researchAccessState({signedIn:true,loading:false,hasProfile:false,error:new Error('offline')}),'unavailable');
});
test('a background connection failure retains a valid cached plan, not an expired one',()=>{
  const account={signedIn:true,loading:false,hasProfile:true,plan:'premium',expiresAt:'2026-10-12',error:new Error('offline')};
  assert.equal(researchAccessState(account,Date.parse('2026-10-11')),'paid');
  assert.equal(researchAccessState(account,Date.parse('2026-10-13')),'free');
  assert.equal(researchAccessState({...account,signedIn:false},Date.parse('2026-10-11')),'free');
  assert.equal(researchAccessState({...account,expiresAt:'invalid'},Date.parse('2026-10-11')),'free');
});
test('a server profile downgrade takes precedence over yesterday\'s paid hint',()=>{
  assert.equal(researchAccessState({signedIn:true,loading:false,hasProfile:true,plan:'free'}),'free');
});
