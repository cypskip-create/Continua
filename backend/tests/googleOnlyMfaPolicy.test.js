import {describe,it,expect,vi} from 'vitest';
import {shouldRequirePassword} from '../node_modules/better-auth/dist/utils/password.mjs';
describe('installed Better Auth passwordless-option boundary',()=>{
 it('still requires the credential password when the option is enabled',async()=>{const findCredentialAccount=vi.fn(async()=>({password:'fixture-bcrypt-digest'}));expect(await shouldRequirePassword({context:{internalAdapter:{findCredentialAccount}}},'fixture-user',true)).toBe(true);expect(findCredentialAccount).toHaveBeenCalledWith('fixture-user');});
 it('only omits the password requirement when no credential password exists',async()=>{for(const account of [null,{password:null},{password:''}])expect(await shouldRequirePassword({context:{internalAdapter:{findCredentialAccount:async()=>account}}},'fixture-user',true)).toBe(false);});
 it('keeps the default password requirement without reading account state',async()=>{const findCredentialAccount=vi.fn();expect(await shouldRequirePassword({context:{internalAdapter:{findCredentialAccount}}},'fixture-user',false)).toBe(true);expect(findCredentialAccount).not.toHaveBeenCalled();});
});
