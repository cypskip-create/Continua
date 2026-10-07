import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  quote: vi.fn(),
  instruments: vi.fn(),
}));
vi.mock("../src/storage/db.js", () => ({ query: mocks.query }));
vi.mock("../src/storage/repositories/pricesRepository.js", () => ({
  pricesRepository: { getQuote: mocks.quote },
}));
vi.mock("../src/storage/repositories/securitiesRepository.js", () => ({
  securitiesRepository: { listInstruments: mocks.instruments },
}));
vi.mock("../src/storage/repositories/candlesRepository.js", () => ({
  candlesRepository: { getCandles: async () => [] },
}));
vi.mock("../src/storage/repositories/corporateActionsRepository.js", () => ({
  corporateActionsRepository: {
    getBySecurity: async () => [],
    getDividendsBySecurity: async () => [],
  },
}));
vi.mock("../src/services/research/engineBundle.js", () => ({
  getEngineBundle: async () => {
    throw new Error("Unavailable enrichment");
  },
}));
import { getPortfolioResearch } from "../src/services/research/engineWorkspace.js";
afterEach(() => vi.resetAllMocks());
it("bounds stalled optional storage without hiding priced holdings",async()=>{
  vi.useFakeTimers();
  try{
    mocks.query.mockImplementation(async sql=>sql.includes("FROM public.portfolios")?{rows:[{symbol:"KCB",shares:2,cost:80,sector:"Banking"}]}:new Promise(()=>{}));
    mocks.instruments.mockResolvedValue([{symbol:"KCB",securityId:"kcb"}]);mocks.quote.mockResolvedValue({lastPrice:50,change:1,currency:"KES",timestamp:new Date().toISOString()});
    const result=getPortfolioResearch("verified-user","NSE");await vi.advanceTimersByTimeAsync(4100);
    expect((await result).totalValue).toBe(100);expect((await result).performance.twr).toBeNull();expect(vi.getTimerCount()).toBe(0);
  }finally{vi.useRealTimers();}
});
it("keeps premium holdings available during persistence outages and withholds returns", async () => {
  mocks.query.mockImplementation(async (sql) => {
    if (sql.includes("FROM public.portfolios"))
      return {
        rows: [{ symbol: "KCB", shares: 2, cost: 80, sector: "Banking" }],
      };
    throw Object.assign(new Error("missing persistence table"), {
      code: "42P01",
    });
  });
  mocks.instruments.mockResolvedValue([{ symbol: "KCB", securityId: "kcb" }]);
  mocks.quote.mockResolvedValue({
    lastPrice: 50,
    change: 1,
    currency: "KES",
    timestamp: new Date(),
  });
  const result = await getPortfolioResearch("verified-user", "NSE");
  expect(result.totalValue).toBe(100);
  expect(result.positions[0]?.symbol).toBe("KCB");
  expect(result.performance.twr).toBeNull();
  expect(result.performance.moneyWeighted).toBeNull();
  expect(result.warnings.join(" ")).toContain("storage is unavailable");
  expect(result.researchBriefing.covered).toBe(0);
});
