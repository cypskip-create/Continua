import { afterEach, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "node:http";
const mocks = vi.hoisted(() => ({ query: vi.fn(), overview: vi.fn(), portfolio: vi.fn(), ask: vi.fn(),check:vi.fn(),rules:vi.fn() }));
vi.mock("../src/config/index.js", () => ({ ACTIVE_EXCHANGES: ["NSE"], env: { SUPABASE_URL: "https://auth.fixture.invalid", NODE_ENV: "test", LOG_LEVEL: "silent" } }));
vi.mock("../src/storage/db.js", () => ({ query: mocks.query }));
vi.mock("../src/services/research/engineWorkspace.js", () => ({ getPortfolioOverview: mocks.overview, getPortfolioResearch: mocks.portfolio, getPeers: vi.fn() }));
vi.mock("../src/services/research/engineBundle.js", () => ({ getEngineBundle: vi.fn() }));
vi.mock("../src/services/research/engineAssistant.js", () => ({ askEngine: mocks.ask }));
vi.mock("../src/storage/repositories/engineRepository.js", () => ({ engineRepository: {rules:mocks.rules} }));
vi.mock("../src/workers/engineMonitorWorker.js",()=>({runEngineMonitoringOnce:mocks.check}));
import { engineWorkbenchRoutes } from "../src/api/routes/engineWorkbench.routes.js";

const realFetch = globalThis.fetch;
const verifiedId = "11111111-1111-4111-8111-111111111111";
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

async function request(plan: string, path: string, method = "GET", authenticated = true,body?:unknown) {
  mocks.query.mockResolvedValue({ rows: [{ subscription_plan: plan }] });
  mocks.overview.mockResolvedValue({ totalValue: 500, coverage: "1/1" });
  mocks.portfolio.mockResolvedValue({ risk: { available: false } });
  mocks.rules.mockResolvedValue([]);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: verifiedId }), { status: 200 })));
  const app = express(); app.use(express.json()); app.use(engineWorkbenchRoutes);
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
it("allows premium portfolio research with the server-verified owner", async () => {
  expect((await request("premium", "/engine/portfolio?exchange=NSE&userId=another-account")).status).toBe(200);
  expect(mocks.portfolio).toHaveBeenCalledWith(verifiedId, "NSE"); expect(mocks.ask).not.toHaveBeenCalled();
});
it("checks only the verified owner's selected symbol and exchange",async()=>{const result=await request("premium","/engine/monitoring/check","POST",true,{symbol:"KCB",exchange:"NSE",userId:"forged"});expect(result.status).toBe(200);expect(mocks.check).toHaveBeenCalledWith(verifiedId,"KCB","NSE");expect(mocks.rules).toHaveBeenCalledWith(verifiedId);});
it("keeps monitoring check subscriber-only",async()=>{expect((await request("free","/engine/monitoring/check","POST",true,{symbol:"KCB"})).status).toBe(403);expect(mocks.check).not.toHaveBeenCalled();});
it("scopes alert history to the authenticated owner",async()=>{expect((await request("premium","/engine/monitoring/activity?userId=forged")).status).toBe(200);expect(mocks.query).toHaveBeenLastCalledWith(expect.stringContaining("WHERE user_id=$1 AND type='engine'"),[verifiedId]);});
