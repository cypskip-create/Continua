import { describe, expect, it } from "vitest";
import { analyseMarket } from "../src/services/research/marketIntelligence.js";
describe("Engine market snapshot analysis", () => {
  it("buckets boundary values exactly once and excludes missing quotes", () => {
    const changes = [-8, -7, -5, -3, -0.1, 0, 0.1, 3, 5, 7, 8, null, NaN];
    const result = analyseMarket(
      changes.map((changePercent, i) => ({
        symbol: `S${i}`,
        sector: "Banking",
        changePercent,
        volume: 10,
        timestamp: "2026-10-07",
      })),
    );
    expect(result.coverage).toBe(11);
    expect(result.distribution.reduce((s, r) => s + (r.count ?? 0), 0)).toBe(
      11,
    );
    expect(result.advancing).toBe(5);
    expect(result.declining).toBe(5);
    expect(result.unchanged).toBe(1);
    expect(result.distribution.map((d) => d.count)).toEqual([
      2, 1, 1, 1, 1, 1, 1, 1, 2,
    ]);
  });
  it("keeps a missing sector explicit and never labels volume as block trades", () => {
    const result = analyseMarket([
      {
        symbol: "KCB",
        sector: null,
        changePercent: 7,
        volume: null,
        timestamp: "2026-10-07",
      },
    ]);
    expect(result.sectors[0]?.name).toBe("Other");
    expect(result.monitor[0]?.signal).toBe("Large session move");
    expect(result.monitor[0]?.volume).toBeNull();
    expect(analyseMarket([]).coverage).toBe(0);
  });
});
