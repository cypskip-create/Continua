import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), quote: vi.fn(), instruments: vi.fn(), bundle: vi.fn() }));
vi.mock("../src/storage/db.js", () => ({ query: mocks.query }));
vi.mock("../src/storage/repositories/pricesRepository.js", () => ({ pricesRepository: { getQuote: mocks.quote } }));
vi.mock("../src/storage/repositories/securitiesRepository.js", () => ({ securitiesRepository: { listInstruments: mocks.instruments } }));
vi.mock("../src/storage/repositories/candlesRepository.js", () => ({ candlesRepository: {} }));
vi.mock("../src/storage/repositories/financialsRepository.js", () => ({ financialsRepository: {} }));
vi.mock("../src/storage/repositories/corporateActionsRepository.js", () => ({ corporateActionsRepository: {} }));
vi.mock("../src/services/research/researchService.js", () => ({ researchService: {} }));
vi.mock("../src/services/research/engineBundle.js", () => ({ getEngineBundle: mocks.bundle }));
import { getPortfolioOverview } from "../src/services/research/engineWorkspace.js";
afterEach(() => { vi.resetAllMocks(); vi.useRealTimers(); });
function setup() {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
  mocks.query.mockResolvedValue({ rows: [{ symbol: "A", shares: 2, cost: 80, sector: "Banking" }, { symbol: "B", shares: 1, cost: 20, sector: "Energy" }] });
  mocks.instruments.mockResolvedValue([{ symbol: "A", securityId: "A" }, { symbol: "B", securityId: "B" }]);
  mocks.quote.mockResolvedValue({ lastPrice: 50, change: 1, volume: 1000, currency: "KES", timestamp: "2026-10-07T10:00:00Z" });
}
it("provides free cost-basis research without premium aggregation or persistence writes", async () => {
  setup(); const result = await getPortfolioOverview("verified-user", "NSE");
  expect(result.totalValue).toBe(150); expect(result.totalCost).toBe(100); expect(result.unrealized).toBe(50);
  expect(result.sessionPnl).toBe(3); expect(mocks.query).toHaveBeenCalledTimes(1);
  expect(mocks.query.mock.calls[0]?.[1]).toEqual(["verified-user"]); expect(mocks.bundle).not.toHaveBeenCalled();
  expect(result).not.toHaveProperty("risk"); expect(result).not.toHaveProperty("performance");
});
it("retains priced holdings after a quote outage and discloses partial coverage", async () => {
  setup(); mocks.quote.mockImplementation(async id => { if (id === "B") throw new Error("quote outage"); return { lastPrice: 50, change: 1, currency: "KES", timestamp: "2026-10-07" }; });
  const result = await getPortfolioOverview("verified-user", "NSE");
  expect(result.coverage).toBe("1/2"); expect(result.totalCost).toBe(80); expect(result.unrealized).toBe(20);
  expect(result.warnings.join(" ")).toContain("Unpriced holdings");
});
it("suppresses stale session contribution instead of presenting it as today's change", async () => {
  setup(); mocks.quote.mockResolvedValue({ lastPrice: 50, change: 1, currency: "KES", timestamp: "2026-09-01" });
  const result = await getPortfolioOverview("verified-user", "NSE");
  expect(result.sessionPnl).toBeNull(); expect(result.warnings.join(" ")).toContain("stale");
});
it("accepts real node-postgres Date objects without crashing portfolio analysis", async () => {
  setup(); mocks.quote.mockResolvedValue({ lastPrice: 50, change: 1, currency: "KES", timestamp: new Date("2026-10-07T10:00:00Z") });
  const result = await getPortfolioOverview("verified-user", "NSE");
  expect(result.totalValue).toBe(150);
  expect(result.sessionDate).toBe("2026-10-07");
  expect(result.sessionPnl).toBe(3);
});
