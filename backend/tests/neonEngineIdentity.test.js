import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({runtime:null,query:vi.fn(),fetch:vi.fn()}));
vi.mock('../src/auth/runtime.js',()=>({getIdentityRuntime:()=>mocks.runtime}));
vi.mock('../src/storage/db.js',()=>({query:mocks.query}));
import {requireEngineUser,requireSubscriber} from '../src/api/middleware/requireSubscriber.js';
const id='00000000-0000-4000-8000-000000000001';
const request=headers=>({header:name=>headers[name.toLowerCase()]});
beforeEach(()=>{mocks.runtime=null;mocks.query.mockReset();mocks.fetch.mockReset();vi.stubGlobal('fetch',mocks.fetch);});
describe('Neon identity at the existing Engine boundary',()=>{
 it('uses live verified identity without the legacy provider key or network',async()=>{const verifyAccess=vi.fn(async()=>({user:{id,email:'fixture@example.invalid'}}));mocks.runtime={verifyAccess};mocks.query.mockResolvedValue({rows:[{subscription_plan:'premium'}]});const res={locals:{}},next=vi.fn();await requireSubscriber(request({'x-user-token':'signed-access'}),res,next);expect(next).toHaveBeenCalledWith();expect(res.locals.engineUserId).toBe(id);expect(res.locals.enginePlan).toBe('premium');expect(mocks.query).toHaveBeenCalledWith('SELECT public.effective_subscription_plan($1) AS subscription_plan',[id]);expect(mocks.fetch).not.toHaveBeenCalled();});
 it('rejects revoked or pending-MFA access before reading entitlements',async()=>{mocks.runtime={verifyAccess:vi.fn(async()=>{throw Error('unverified');})};const next=vi.fn();await requireEngineUser(request({'x-user-token':'revoked','x-plan':'premium_plus'}),{locals:{}},next);expect(next.mock.calls[0][0].statusCode??next.mock.calls[0][0].status).toBe(401);expect(mocks.query).not.toHaveBeenCalled();expect(mocks.fetch).not.toHaveBeenCalled();});
 it('does not trust a client subscription plan',async()=>{mocks.runtime={verifyAccess:vi.fn(async()=>({user:{id}}))};mocks.query.mockResolvedValue({rows:[{subscription_plan:'free'}]});const next=vi.fn();await requireSubscriber(request({'x-user-token':'signed-access','x-plan':'premium_plus'}),{locals:{}},next);expect(next.mock.calls[0][0].statusCode??next.mock.calls[0][0].status).toBe(403);});
});
