import {describe,it,expect,vi} from 'vitest';
import {deleteOwnedAccount} from './deleteAccount.js';
const userId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',sessionId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const identity={user:{id:userId,session_id:sessionId}};
const body={confirmation:'DELETE',accountId:userId};
describe('atomic owned account deletion',()=>{
 it('requires exact owner confirmation before database work',async()=>{
  const connect=vi.fn();await expect(deleteOwnedAccount({database:{connect},identity,body:{...body,accountId:sessionId}})).rejects.toMatchObject({status:400});expect(connect).not.toHaveBeenCalled();
 });
 it('rejects stale sign-in even if a caller has an otherwise valid session',async()=>{
  const query=vi.fn(async sql=>({rows:sql.includes('FOR UPDATE')?[{password_verified_at:'2000-01-01',mfa_enabled:false,google_linked:false}]:[]})),release=vi.fn();
  await expect(deleteOwnedAccount({database:{connect:async()=>({query,release})},identity,body})).rejects.toMatchObject({status:403});
  expect(query.mock.calls.at(-1)[0]).toBe('ROLLBACK');expect(query.mock.calls.some(([sql])=>sql.startsWith('DELETE'))).toBe(false);expect(release).toHaveBeenCalledOnce();
 });
 it('rolls back the identity and cleanup queue together on any deletion failure',async()=>{
  const query=vi.fn(async sql=>{
   if(sql.includes('FOR UPDATE'))return {rows:[{password_verified_at:new Date(),mfa_enabled:false}]};
   if(sql.startsWith('DELETE'))throw Error('Constraint failure');return {rows:[]};
  });
  await expect(deleteOwnedAccount({database:{connect:async()=>({query,release:vi.fn()})},identity,body})).rejects.toThrow('Constraint failure');
  expect(query.mock.calls.some(([sql])=>sql.includes('INSERT INTO app_identity.account_media_cleanup'))).toBe(true);
  expect(query.mock.calls.at(-1)[0]).toBe('ROLLBACK');expect(query.mock.calls.some(([sql])=>sql==='COMMIT')).toBe(false);
 });
 it('enabled MFA must be completed even with fresh Google proof',async()=>{
  const query=vi.fn(async sql=>({rows:sql.includes('FOR UPDATE')?[{oauth_verified_at:new Date(),google_linked:true,mfa_enabled:true,mfa_verified_at:null}]:[]}));
  await expect(deleteOwnedAccount({database:{connect:async()=>({query,release:vi.fn()})},identity,body})).rejects.toMatchObject({status:403});
 });
});
