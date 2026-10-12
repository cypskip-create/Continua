import {afterEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({query:vi.fn(),transaction:vi.fn(),env:{PAYSTACK_NATIVE_ENABLED:true,PAYSTACK_NATIVE_MODE:'test',PAYSTACK_TEST_USER_IDS:'owner',PAYSTACK_TEST_SECRET_KEY:'sk_test_fixture',PAYSTACK_CARD_RENEWAL_ENABLED:false,PAYSTACK_RENEWAL_ENCRYPTION_KEY:undefined as string|undefined},liveEnabled:vi.fn(()=>true),liveVerify:vi.fn()}));
vi.mock('../src/config/index.js',()=>({env:mocks.env}));
vi.mock('../src/monitoring/logger.js',()=>({logger:{error:vi.fn(),warn:vi.fn()}}));
vi.mock('../src/storage/db.js',()=>({query:mocks.query,withTransaction:mocks.transaction}));
vi.mock('../src/services/paystackLive.js',()=>({liveCheckoutEnabled:mocks.liveEnabled,verifyLiveCheckout:mocks.liveVerify}));
import {normalizeKenyanPhone,nativeCheckoutEnabled,nativeCheckoutInput,initializeNativeCheckout,verifyNativeCheckout,cardRenewalEnabled,nextMonth,encryptAuthorization,decryptAuthorization} from '../src/services/paystackNative.js';
const reference='continua-test-11111111-1111-4111-8111-111111111111';
const input={plan:'premium_plus',cycle:'monthly',accepted:true,policyVersion:'2026-10-12',intentId:'11111111-1111-4111-8111-111111111111',paymentMethod:'mpesa',phone:'0712345678',autoRenew:false} as const;
const order={reference,user_id:'owner',email:'owner@example.com',mode:'test',plan:'premium_plus',cycle:'monthly',method:'mpesa',amount_minor:100000,intent_id:input.intentId,state:'creating',access_code:null,created_at:'2026-10-12T12:00:00Z'};
afterEach(()=>{vi.resetAllMocks();vi.unstubAllGlobals();mocks.env.PAYSTACK_NATIVE_ENABLED=true;mocks.env.PAYSTACK_NATIVE_MODE='test';mocks.env.PAYSTACK_TEST_SECRET_KEY='sk_test_fixture';mocks.env.PAYSTACK_CARD_RENEWAL_ENABLED=false;mocks.env.PAYSTACK_RENEWAL_ENCRYPTION_KEY=undefined;});
it.each(['0712345678','+254712345678','254712345678','0712 345 678','(0712) 345-678'])('normalizes %s',phone=>expect(normalizeKenyanPhone(phone)).toBe('+254712345678'));
it.each(['123','+255712345678','0712345678secret','2540712345678','+254+712345678'])('rejects %s',phone=>expect(()=>normalizeKenyanPhone(phone)).toThrow());
it('fails closed with a live key in test configuration',()=>{mocks.env.PAYSTACK_TEST_SECRET_KEY='sk_live_fixture';expect(nativeCheckoutEnabled()).toBe(false);});
it('rejects Till, raw card fields, stale terms and malformed intent',()=>{
 for(const override of [{paymentMethod:'mptill'},{cardNumber:'4111111111111111'},{policyVersion:'old'},{intentId:'bad'},{phone:'123'}])expect(nativeCheckoutInput.safeParse({...input,...override}).success).toBe(false);
});
it('only permits explicit monthly card renewal, never mobile or annual renewal',()=>{
 expect(nativeCheckoutInput.safeParse({...input,autoRenew:true}).success).toBe(false);
 expect(nativeCheckoutInput.safeParse({...input,paymentMethod:'card',phone:undefined,autoRenew:true}).success).toBe(true);
 expect(nativeCheckoutInput.safeParse({...input,paymentMethod:'card',phone:undefined,cycle:'annual',autoRenew:true}).success).toBe(false);
 expect(nativeCheckoutInput.parse(input).autoRenew).toBe(false);
});
it('renewal is disabled without its separate opt-in and encryption configuration',()=>{
 expect(cardRenewalEnabled()).toBe(false);mocks.env.PAYSTACK_CARD_RENEWAL_ENABLED=true;expect(cardRenewalEnabled()).toBe(false);
 mocks.env.PAYSTACK_RENEWAL_ENCRYPTION_KEY='11'.repeat(32);expect(cardRenewalEnabled()).toBe(true);
});
it('encrypts only provider authorization tokens with randomized authenticated encryption',()=>{
 mocks.env.PAYSTACK_RENEWAL_ENCRYPTION_KEY='11'.repeat(32);
 const a=encryptAuthorization('AUTH_fixture'),b=encryptAuthorization('AUTH_fixture');
 expect(a).not.toBe(b);expect(a).not.toContain('AUTH_fixture');expect(decryptAuthorization(a)).toBe('AUTH_fixture');
 const parts=a.split('.');parts[1]=Buffer.alloc(16).toString('base64');expect(()=>decryptAuthorization(parts.join('.'))).toThrow();
});
it('clamps month-end renewal dates, preserving UTC time',()=>{
 expect(nextMonth(new Date('2026-01-31T10:00:00Z')).toISOString()).toBe('2026-02-28T10:00:00.000Z');
 expect(nextMonth(new Date('2028-01-31T10:00:00Z')).toISOString()).toBe('2028-02-29T10:00:00.000Z');
});
it('uses the server price and native provider, never a checkout redirect',async()=>{
 mocks.transaction.mockResolvedValue({order,created:true});mocks.query.mockResolvedValue({rows:[]});
 const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({status:true,data:{reference,status:'pay_offline'}})));vi.stubGlobal('fetch',fetch);
 expect(await initializeNativeCheckout('owner',order.email,input)).toMatchObject({reference,amount:1000,status:'pending',accessCode:null});
 expect(fetch.mock.calls[0]?.[0]).toBe('https://api.paystack.co/charge');
 expect(JSON.parse(fetch.mock.calls[0]?.[1].body)).toMatchObject({amount:100000,currency:'KES',mobile_money:{phone:'+254712345678',provider:'mpesa'}});
});
it('does not initiate another charge for a reserved attempt',async()=>{
 mocks.transaction.mockResolvedValue({order:{...order,state:'pending'},created:false});const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 await initializeNativeCheckout('owner',order.email,input);expect(fetch).not.toHaveBeenCalled();
});
it('preserves recovery on ambiguous provider timeout',async()=>{
 mocks.transaction.mockResolvedValue({order:{...order},created:true});mocks.query.mockResolvedValue({rows:[]});vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('timeout')));
 expect(await initializeNativeCheckout('owner',order.email,input)).toMatchObject({reference,status:'unknown'});
});
it('checks ownership before contacting Paystack',async()=>{mocks.query.mockResolvedValue({rows:[]});const fetch=vi.fn();vi.stubGlobal('fetch',fetch);await expect(verifyNativeCheckout(reference,'other')).rejects.toThrow('not found');expect(fetch).not.toHaveBeenCalled();});
const transaction={id:99,domain:'test',reference,status:'success',amount:100000,currency:'KES',paid_at:'2026-10-12T12:00:00Z',customer:{email:order.email},metadata:{continua_reference:reference,continua_user:'owner',mode:'test'}};
it.each(['abandoned','failed'])('retains an Inline card session after provider %s',async status=>{
 mocks.query.mockResolvedValueOnce({rows:[{...order,method:'card',access_code:'secure-session'}]}).mockResolvedValue({rows:[]});
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({status:true,data:{...transaction,status,paid_at:null}}))));
 expect(await verifyNativeCheckout(reference,'owner')).toMatchObject({status:'pending',accessCode:'secure-session',paymentMethod:'card'});
 expect(mocks.query.mock.calls.some(c=>c[0].includes('SET state=$2'))).toBe(false);
});
it('finalizes failed recurring card charges without an Inline session',async()=>{
 mocks.query.mockResolvedValueOnce({rows:[{...order,method:'card',access_code:null}]}).mockResolvedValue({rows:[]});
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({status:true,data:{...transaction,status:'failed',paid_at:null}}))));
 expect(await verifyNativeCheckout(reference,'owner')).toMatchObject({status:'failed'});
 expect(mocks.query.mock.calls.some(c=>c[0].includes('enabled=false'))).toBe(true);
});
it('never grants real membership after verified sandbox payment',async()=>{
 mocks.query.mockResolvedValueOnce({rows:[order]}).mockResolvedValue({rows:[]});vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({status:true,data:transaction}))));
 expect(await verifyNativeCheckout(reference,'owner')).toMatchObject({mode:'test',status:'paid',membershipChanged:false});expect(mocks.liveVerify).not.toHaveBeenCalled();
 expect(mocks.query.mock.calls.some(c=>c[0].includes('fulfill_paystack_live_order'))).toBe(false);
});
it.each([{amount:1},{domain:'live'},{currency:'USD'},{customer:{email:'other@example.com'}},{paid_at:null}])('rejects mismatched sandbox verification %j',async override=>{
 mocks.query.mockResolvedValue({rows:[order]});vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({status:true,data:{...transaction,...override}}))));
 await expect(verifyNativeCheckout(reference,'owner')).rejects.toThrow('does not match');expect(mocks.query).toHaveBeenCalledTimes(1);
});
