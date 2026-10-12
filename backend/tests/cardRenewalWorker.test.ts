import {afterEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({query:vi.fn(),transaction:vi.fn(),enabled:vi.fn(()=>true),provider:vi.fn(),verify:vi.fn()}));
vi.mock('../src/config/index.js',()=>({env:{PAYSTACK_NATIVE_MODE:'test'}}));
vi.mock('../src/monitoring/logger.js',()=>({logger:{warn:vi.fn()}}));
vi.mock('../src/storage/db.js',()=>({query:m.query,withTransaction:m.transaction}));
vi.mock('../src/services/paystackNative.js',()=>({cardRenewalEnabled:m.enabled,nativeProvider:m.provider,verifyNativeCheckout:m.verify,decryptAuthorization:()=> 'AUTH_fixture'}));
import {runCardRenewals} from '../src/workers/cardRenewalWorker.js';
afterEach(()=>{vi.resetAllMocks();m.enabled.mockReturnValue(true);});
it('makes no requests or charges when disabled',async()=>{m.enabled.mockReturnValue(false);await runCardRenewals();expect(m.query).not.toHaveBeenCalled();expect(m.provider).not.toHaveBeenCalled();});
it('only verifies a previously reserved renewal, never initiates a duplicate',async()=>{
 m.query.mockResolvedValue({rows:[{user_id:'owner',mode:'test'}]});
 m.transaction.mockResolvedValue({reference:'existing',initiate:false,renewal:{mode:'test'}});m.verify.mockResolvedValue({status:'pending'});
 await runCardRenewals();expect(m.provider).not.toHaveBeenCalled();expect(m.verify).toHaveBeenCalledWith('existing');
});
it('preserves the reference after an ambiguous provider error without retrying charge authorization',async()=>{
 m.query.mockResolvedValueOnce({rows:[{user_id:'owner',mode:'test'}]}).mockResolvedValue({rows:[]});
 m.transaction.mockResolvedValue({reference:'reserved',initiate:true,amount:100000,renewal:{mode:'test',email:'fixture@example.com',user_id:'owner',authorization_cipher:'encrypted'}});
 m.provider.mockRejectedValue(new Error('timeout'));m.verify.mockRejectedValue(new Error('still pending'));
 await runCardRenewals();expect(m.provider).toHaveBeenCalledTimes(1);expect(m.query).toHaveBeenLastCalledWith(expect.stringContaining("state='unknown'"),['reserved']);
});
