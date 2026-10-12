import {createHmac} from 'node:crypto';
import {afterEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({native:vi.fn(),live:vi.fn()}));
vi.mock('../src/config/index.js',()=>({env:{PAYSTACK_SECRET_KEY:'sk_live_fixture',PAYSTACK_NATIVE_MODE:'test'}}));
vi.mock('../src/storage/db.js',()=>({query:vi.fn()}));
vi.mock('../src/monitoring/logger.js',()=>({logger:{error:vi.fn(),warn:vi.fn()}}));
vi.mock('../src/api/middleware/requireSubscriber.js',()=>({requireEngineUser:vi.fn()}));
vi.mock('../src/services/paystackLive.js',()=>({liveCheckoutEnabled:()=>true,initializeLiveCheckout:vi.fn(),verifyLiveCheckout:m.live,liveReferencePattern:/^continua-live-[0-9a-f-]{36}$/}));
vi.mock('../src/services/paystackNative.js',()=>({nativeCheckoutForUser:()=>false,nativeCheckoutInput:{safeParse:vi.fn()},initializeNativeCheckout:vi.fn(),verifyNativeCheckout:m.native,nativeSecret:(mode:string)=>`sk_${mode}_fixture`,nativeReferencePattern:/^continua-(live|test)-[0-9a-f-]{36}$/,cardRenewalEnabled:()=>false}));
import {paystackWebhook} from '../src/api/routes/billing.routes.js';
import {ApiError} from '../src/api/middleware/errorHandler.js';
const reference='continua-test-11111111-1111-4111-8111-111111111111';
function invoke(body:Buffer,signature?:string){return new Promise<number>((resolve,reject)=>{
 paystackWebhook({body,header:()=>signature} as any,{sendStatus:resolve} as any,reject);
});}
function signature(body:Buffer,mode='test'){return createHmac('sha512',`sk_${mode}_fixture`).update(body).digest('hex');}
afterEach(()=>vi.resetAllMocks());
it('requires a valid raw-body signature',async()=>{
 const body=Buffer.from(JSON.stringify({event:'charge.success',data:{reference}}));
 await expect(invoke(body)).rejects.toThrow('Invalid payment signature');expect(m.native).not.toHaveBeenCalled();
});
it('verifies signed test events independently without using live fulfillment',async()=>{
 const body=Buffer.from(JSON.stringify({event:'charge.success',data:{reference}}));m.native.mockResolvedValue({mode:'test',membershipChanged:false});
 expect(await invoke(body,signature(body))).toBe(200);expect(m.native).toHaveBeenCalledWith(reference);expect(m.live).not.toHaveBeenCalled();
});
it('rejects signature/reference mode mismatch',async()=>{
 const body=Buffer.from(JSON.stringify({event:'charge.success',data:{reference}}));await expect(invoke(body,signature(body,'live'))).rejects.toThrow('mode mismatch');expect(m.native).not.toHaveBeenCalled();
});
it('preserves verified live-order recovery from before native checkout',async()=>{
 const legacy=reference.replace('test','live'),body=Buffer.from(JSON.stringify({event:'charge.success',data:{reference:legacy}}));
 m.native.mockRejectedValue(new ApiError(404,'Checkout not found'));m.live.mockResolvedValue({status:'paid'});
 expect(await invoke(body,signature(body,'live'))).toBe(200);expect(m.live).toHaveBeenCalledWith(legacy);
});
it('rejects malformed signed JSON without granting access',async()=>{
 const body=Buffer.from('{bad');await expect(invoke(body,signature(body))).rejects.toThrow('Invalid payment event');expect(m.native).not.toHaveBeenCalled();
});
