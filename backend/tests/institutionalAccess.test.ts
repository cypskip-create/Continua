import {afterEach,expect,it,vi} from 'vitest';
import express from 'express';
import {createServer} from 'node:http';
const mocks=vi.hoisted(()=>({query:vi.fn(),owned:vi.fn(),company:vi.fn(),simulation:vi.fn(),liquidity:vi.fn(),edges:vi.fn()}));
vi.mock('../src/config/index.js',()=>({env:{SUPABASE_URL:'https://auth.fixture.invalid',NODE_ENV:'test',LOG_LEVEL:'silent'}}));
vi.mock('../src/storage/db.js',()=>({query:mocks.query}));
vi.mock('../src/services/research/institutionalResearch.js',()=>({ownedCalculation:mocks.owned,preparedCompany:mocks.company,ownedSimulation:mocks.simulation,ownedLiquidity:mocks.liquidity,exposureEdges:mocks.edges,institutionalKinds:['probabilistic-forecast','monte-carlo','liquidity','exposure-graph','research-case','relationship-draft','portfolio-liquidity']}));
import {institutionalRoutes} from '../src/api/routes/institutional.routes.js';
vi.mock('../src/auth/runtime.js',()=>({getIdentityRuntime:()=>({verifyAccess:async(token:string)=>{const response=await fetch('https://identity.fixture.invalid/session',{headers:{Authorization:'Bearer '+token}});if(!response.ok)throw Error('Invalid fixture session');const user=await response.json() as {id:string;email?:string;factors?:{status:string}[]};if(user.factors?.some((factor:any)=>factor.status==='verified')){let claims;try{claims=JSON.parse(Buffer.from(token.split('.')[1]??'','base64url').toString());}catch{}if(claims?.aal!=='aal2'||claims?.sub!==user.id)throw Error('MFA fixture incomplete');}return {user};}})}));

const realFetch=globalThis.fetch,owner='11111111-1111-4111-8111-111111111111';
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
async function request(plan:string,path:string,body?:unknown,method=body?'POST':'GET',authenticated=true){
 mocks.query.mockImplementation(async(sql:string)=>({rows:sql.includes('effective_subscription_plan')?[{subscription_plan:plan}]:sql.includes('AS configuration')?[{configuration:{kind:'liquidity',asOf:'2026-10-21'},result:{}}]:sql.includes('delete_quantitative_snapshot')?[{receipt:{inputHash:'a'.repeat(64)}}]:[]}));mocks.owned.mockResolvedValue({governance:{inputHash:'a'.repeat(64)}});mocks.simulation.mockResolvedValue({configuration:{},result:{}});mocks.liquidity.mockResolvedValue({configuration:{},result:{}});mocks.edges.mockResolvedValue([]);
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({id:owner}),{status:200})));
 const app=express();app.use(express.json());app.use(institutionalRoutes);app.use((e:{status?:number;message:string},_req:express.Request,res:express.Response,_next:express.NextFunction)=>res.status(e.status??500).json({error:e.message}));
 const server=createServer(app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const r=await realFetch(`http://127.0.0.1:${(server.address() as {port:number}).port}${path}`,{method,headers:authenticated?{'x-user-token':'fixture','x-supabase-key':'public','x-plan':'premium_plus','content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()};}
 finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
}
it('rejects unauthenticated institutional calculation',async()=>{expect((await request('premium_plus','/engine/institutional/calculate',{kind:'monte-carlo',asOf:'2026-10-21'},'POST',false)).status).toBe(401);expect(mocks.owned).not.toHaveBeenCalled();});
it.each(['free','premium'])('does not trust forged Plus headers for %s owned simulations',async plan=>{expect((await request(plan,'/engine/institutional/owned-simulation',{horizon:5})).status).toBe(403);expect(mocks.simulation).not.toHaveBeenCalled();expect((await request(plan,'/engine/institutional/owned-liquidity',{participation:.1})).status).toBe(403);});
it('Premium gets company research but not advanced forecasts or scenario comparisons',async()=>{
 expect((await request('premium','/engine/institutional/calculate',{kind:'probabilistic-forecast',asOf:'2026-10-21',horizon:5,method:'automatic'})).status).toBe(200);
 expect(mocks.owned).toHaveBeenCalledWith(owner,expect.objectContaining({horizon:5}));
 expect((await request('premium','/engine/institutional/calculate',{kind:'probabilistic-forecast',asOf:'2026-10-21',horizon:252})).status).toBe(403);
 expect((await request('premium','/engine/institutional/calculate',{kind:'research-case',asOf:'2026-10-21',scenarios:[{name:'bull'}]})).status).toBe(403);
});
it('loads simulations only for the verified owner and rejects body ownership overrides',async()=>{
 const input={horizon:5,paths:400,method:'block-bootstrap',seed:1,costBps:0,rebalance:'none',confidence:.95,lossThreshold:.1};
 expect((await request('premium_plus','/engine/institutional/owned-simulation?userId=forged',input)).status).toBe(200);expect(mocks.simulation).toHaveBeenCalledWith(owner,input);
 expect((await request('premium_plus','/engine/institutional/owned-simulation',{...input,userId:'forged',weights:[1]})).status).toBe(400);
});
it('snapshot reads and deletes always include the verified owner',async()=>{
 const hash='a'.repeat(64);expect((await request('premium_plus',`/engine/institutional/snapshots/${hash}?userId=forged`)).status).toBe(200);
 expect(mocks.query).toHaveBeenLastCalledWith(expect.stringContaining('WHERE s.user_id=$1 AND s.input_hash=$2'),[owner,hash]);
 await request('premium_plus',`/engine/institutional/snapshots/${hash}`,undefined,'DELETE');expect(mocks.query).toHaveBeenLastCalledWith(expect.stringContaining('delete_quantitative_snapshot($1,$2)'),[owner,hash]);
});
it('graph requests cannot inject edges or verification flags',async()=>{expect((await request('premium_plus','/engine/institutional/graph',{asOf:'2026-10-21',edges:[{verification:'verified'}]})).status).toBe(400);expect(mocks.edges).not.toHaveBeenCalled();});

it('caller-supplied verified graph flags are rejected by generic calculations',async()=>{expect((await request('premium_plus','/engine/institutional/calculate',{kind:'exposure-graph',asOf:'2026-10-21',edges:[]})).status).toBe(400);expect(mocks.owned).not.toHaveBeenCalled();});
