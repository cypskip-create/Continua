import { afterEach, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "node:http";
const mocks = vi.hoisted(() => ({ query: vi.fn(), overview: vi.fn(), portfolio: vi.fn(), ask: vi.fn(),check:vi.fn(),rules:vi.fn(),bundle:vi.fn(),calculate:vi.fn(),stockRisk:vi.fn(),saveRule:vi.fn() }));
vi.mock("../src/config/index.js", () => ({ ACTIVE_EXCHANGES: ["NSE"], env: { SUPABASE_URL: "https://auth.fixture.invalid", NODE_ENV: "test", LOG_LEVEL: "silent" } }));
vi.mock("../src/storage/db.js", () => ({ query: mocks.query }));
vi.mock("../src/services/research/engineWorkspace.js", () => ({ getPortfolioOverview: mocks.overview, getPortfolioResearch: mocks.portfolio, getPeers: vi.fn() }));
vi.mock("../src/services/research/engineBundle.js", () => ({ getEngineBundle: mocks.bundle }));
vi.mock("../src/services/research/engineAssistant.js", () => ({ askEngine: mocks.ask }));
vi.mock("../src/storage/repositories/engineRepository.js", () => ({ engineRepository: {rules:mocks.rules,saveRule:mocks.saveRule} }));
vi.mock("../src/workers/engineMonitorWorker.js",()=>({runEngineMonitoringOnce:mocks.check}));
vi.mock('../src/services/research/pythonCalculations.js',async(importOriginal)=>({...await importOriginal<typeof import('../src/services/research/pythonCalculations.js')>(),pythonCalculation:mocks.calculate}));
vi.mock('../src/services/research/stockRisk.js',()=>({getStockRisk:mocks.stockRisk}));
import { engineWorkbenchRoutes } from "../src/api/routes/engineWorkbench.routes.js";
import { engineRoutes } from "../src/api/routes/engine.routes.js";

vi.mock('../src/auth/runtime.js',()=>({getIdentityRuntime:()=>({verifyAccess:async(token:string)=>{const response=await fetch('https://identity.fixture.invalid/session',{headers:{Authorization:'Bearer '+token}});if(!response.ok)throw Error('Invalid fixture session');const user=await response.json() as {id:string;email?:string;factors?:{status:string}[]};if(user.factors?.some((factor:any)=>factor.status==='verified')){let claims;try{claims=JSON.parse(Buffer.from(token.split('.')[1]??'','base64url').toString());}catch{}if(claims?.aal!=='aal2'||claims?.sub!==user.id)throw Error('MFA fixture incomplete');}return {user};}})}));

const realFetch = globalThis.fetch;
const verifiedId = "11111111-1111-4111-8111-111111111111";
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

async function request(plan: string, path: string, method = "GET", authenticated = true,body?:unknown) {
  mocks.query.mockResolvedValue({ rows: [{ subscription_plan: plan }] });
  mocks.overview.mockResolvedValue({ available:true,totalValue: 500, coverage: "1/1",positions:[{symbol:'KCB',sector:'Banking',value:500,asOf:'2026-10-10T00:00:00Z'}],warnings:[] });
  mocks.portfolio.mockResolvedValue({ risk: { available: false },riskIntelligence:{version:"server-owned"} });
  mocks.calculate.mockResolvedValue({status:200,data:{simulation:true}});
  mocks.stockRisk.mockResolvedValue({version:"stock-risk"});
  mocks.rules.mockResolvedValue([]);
  mocks.bundle.mockResolvedValue({symbol:'KCB',history:[],valuation:{models:[]}});
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: verifiedId }), { status: 200 })));
  const app = express(); app.use(express.json()); app.use(engineWorkbenchRoutes); app.use(engineRoutes);
  app.use((error: { status?: number; message: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(error.status ?? 500).json({ error: error.message }); });
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  try {
    const response = await realFetch(`http://127.0.0.1:${address.port}${path}`, { method,
      headers: authenticated ? { "x-user-token": "fixture-session", "x-supabase-key": "public", "x-plan": "premium_plus","content-type":"application/json" } : {},body:body?JSON.stringify(body):undefined });
    return { status: response.status, body: await response.json() };
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}

it.each(["free", "premium", "premium_plus"])("keeps basic portfolio overview available for %s using the verified owner", async plan => {
  const result = await request(plan, "/engine/portfolio/overview?exchange=NSE&userId=another-account");
  expect(result.status).toBe(200); expect(mocks.overview).toHaveBeenCalledWith(verifiedId, "NSE");
  expect(mocks.portfolio).not.toHaveBeenCalled(); expect(mocks.ask).not.toHaveBeenCalled();
});
it("rejects unauthenticated overview requests", async () => {
  expect((await request("free", "/engine/portfolio/overview", "GET", false)).status).toBe(401);
  expect(mocks.overview).not.toHaveBeenCalled();
});
it.each([["/engine/portfolio", "GET"], ["/engine/assistant", "POST"], ["/engine/cash-flows", "POST"]])("does not unlock %s through a forged premium header", async (path, method) => {
  expect((await request("free", path, method)).status).toBe(403);
  expect(mocks.portfolio).not.toHaveBeenCalled(); expect(mocks.ask).not.toHaveBeenCalled();
});
it("allows Premium Plus portfolio research with the server-verified owner", async () => {
  expect((await request("premium_plus", "/engine/portfolio?exchange=NSE&userId=another-account")).status).toBe(200);
  expect(mocks.portfolio).toHaveBeenCalledWith(verifiedId, "NSE"); expect(mocks.ask).not.toHaveBeenCalled();
});
it("checks only the verified owner's selected symbol and exchange",async()=>{const result=await request("premium_plus","/engine/monitoring/check","POST",true,{symbol:"KCB",exchange:"NSE",userId:"forged"});expect(result.status).toBe(200);expect(mocks.check).toHaveBeenCalledWith(verifiedId,"KCB","NSE");expect(mocks.rules).toHaveBeenCalledWith(verifiedId);});
it("keeps monitoring check subscriber-only",async()=>{expect((await request("free","/engine/monitoring/check","POST",true,{symbol:"KCB"})).status).toBe(403);expect(mocks.check).not.toHaveBeenCalled();});
it("scopes alert history to the authenticated owner",async()=>{expect((await request("premium_plus","/engine/monitoring/activity?userId=forged")).status).toBe(200);expect(mocks.query).toHaveBeenLastCalledWith(expect.stringContaining("WHERE user_id=$1 AND type='engine'"),[verifiedId]);});
it.each(['free','premium','premium_plus'])('company research and Forecast expansions use verified %s membership', async plan => {
  const result = await request(plan, '/engine/KCB?exchange=NSE');
  expect(result.status).toBe(plan === 'free' ? 403 : 200);
  if (plan === 'free') expect(mocks.bundle).not.toHaveBeenCalled();
  else expect(mocks.bundle).toHaveBeenCalledWith('KCB','NSE');
});
it.each(['/engine/portfolio','/engine/peers?symbol=KCB','/engine/preferences','/engine/usage'])('Premium still cannot access Plus workspace endpoint %s', async path => {
  expect((await request('premium',path)).status).toBe(403);
});
it.each(['/engine/labs/stress','/engine/labs/bond','/engine/labs/futures'])('requires Plus for %s even with a forged header',async path=>{
 expect((await request('premium',path,'POST',true,{})).status).toBe(403);
});
it('stress uses only verified holdings and rejects forged body ownership',async()=>{
 const valid=await request('premium_plus','/engine/labs/stress','POST',true,{marketShock:-.1});
 expect(valid.status).toBe(200);expect(mocks.overview).toHaveBeenCalledWith(verifiedId,'NSE');expect((valid.body as {data:{pnl:number}}).data.pnl).toBeCloseTo(-50);
 expect((await request('premium_plus','/engine/labs/stress','POST',true,{marketShock:-.1,userId:'forged'})).status).toBe(400);
 expect((await request('premium_plus','/engine/labs/stress','POST',true,{marketShock:-.1,sectorShocks:{Energy:-.2}})).status).toBe(400);
});

it.each(['free','premium'])('blocks %s from full risk simulations',async plan=>{
 expect((await request(plan,'/engine/labs/intelligence','POST',true,{})).status).toBe(403);
 expect(mocks.portfolio).not.toHaveBeenCalled();expect(mocks.calculate).not.toHaveBeenCalled();
});
it('loads risk simulation evidence using the verified owner',async()=>{
 const result=await request('premium_plus','/engine/labs/intelligence?userId=forged','POST',true,{scenario:{marketShock:-.2}});
 expect(result.status).toBe(200);expect(mocks.portfolio).toHaveBeenCalledWith(verifiedId,'NSE');
 expect(mocks.calculate).toHaveBeenCalledWith('risk_simulation',[{version:'server-owned'},{scenario:{marketShock:-.2}}]);
});
it.each(['free','premium','premium_plus'])('enforces %s stock risk access on the backend',async plan=>{
 const result=await request(plan,'/engine/risk/KCB');expect(result.status).toBe(plan==='free'?403:200);
 if(plan==='free')expect(mocks.stockRisk).not.toHaveBeenCalled();else expect(mocks.stockRisk).toHaveBeenCalledWith('KCB');
});

it.each(['free','premium'])('investment simulations and owned scopes remain Plus-only for %s',async plan=>{
 for(const path of ['/engine/investment/simulations','/engine/investment/event-preferences','/engine/investment/coverage'])expect((await request(plan,path)).status).toBe(403);
 expect((await request(plan,'/engine/investment/calculate','POST',true,{kind:'optimization',userId:'forged'})).status).toBe(403);
 expect((await request(plan,'/engine/investment/evidence?kind=event&scope=held&asOf='+new Date().toISOString().slice(0,10))).status).toBe(403);
 expect(mocks.portfolio).not.toHaveBeenCalled();expect(mocks.calculate).not.toHaveBeenCalled();
});
it('rejects malformed and historical basic evidence requests before querying the ledger',async()=>{
 expect((await request('free','/engine/investment/evidence?kind=macro&asOf=2020-01-01')).status).toBe(403);
 expect((await request('free','/engine/investment/evidence?kind=macro&asOf=invalid')).status).toBe(400);
 expect(mocks.query.mock.calls.every(([sql])=>sql.includes('effective_subscription_plan'))).toBe(true);
});
it('scopes simulation reads and deletes to the authenticated owner',async()=>{
 const path='/engine/investment/simulations/22222222-2222-4222-8222-222222222222?userId=forged';
 await request('premium_plus',path);
 expect(mocks.query).toHaveBeenLastCalledWith(expect.stringContaining('WHERE user_id=$1 AND id=$2'),[verifiedId,'22222222-2222-4222-8222-222222222222']);
 await request('premium_plus',path,'DELETE');
 expect(mocks.query).toHaveBeenLastCalledWith(expect.stringContaining('DELETE FROM market.investment_simulations WHERE user_id=$1 AND id=$2'),[verifiedId,'22222222-2222-4222-8222-222222222222']);
});
it('rejects null event consent and client-owned allocation inputs',async()=>{
 expect((await request('premium_plus','/engine/investment/event-preferences','POST',true,{enabled:null,held:true,watched:true,macro:false})).status).toBe(400);
 expect((await request('premium_plus','/engine/investment/optimize-owned','POST',true,{objective:'minimum-variance',turnoverCap:1,symbols:['FORGED'],covariance:[[1]]})).status).toBe(400);
 expect(mocks.portfolio).not.toHaveBeenCalled();
});

it('allows Premium alert management but keeps Plus kinds restricted',async()=>{expect((await request('premium','/engine/monitoring')).status).toBe(200);expect((await request('premium','/engine/monitoring','POST',true,{symbol:'KCB',exchange:'NSE',kind:'material_change'})).status).toBe(403);const response=await request('premium','/engine/monitoring','POST',true,{symbol:'KCB',exchange:'NSE',kind:'volume_above',threshold:1000});expect(response.status).toBe(200);expect(mocks.saveRule).toHaveBeenCalledWith(verifiedId,expect.objectContaining({kind:'volume_above'}),20);});
