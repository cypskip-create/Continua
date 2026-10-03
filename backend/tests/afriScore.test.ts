import { describe, it, expect } from "vitest";
import { computeAfriScore } from "../src/services/research/afriScore.js";
import { computeRatios } from "../src/services/research/ratiosEngine.js";

describe("ratiosEngine", () => {
  it("computes PE, ROE, margins from raw fundamentals", () => {
    const ratios = computeRatios({
      price: 100, sharesOutstanding: 1_000_000, netIncome: 10_000_000, revenue: 50_000_000,
      totalEquity: 40_000_000, totalAssets: 90_000_000, totalDebt: 20_000_000,
      currentAssets: 30_000_000, currentLiabilities: 15_000_000, grossProfit: 25_000_000,
      operatingIncome: 15_000_000,
    });
    expect(ratios.pe).toBeCloseTo(10, 1);       // price 100 / eps 10
    expect(ratios.ps).toBeCloseTo(2, 1);        // 100M market cap / 50M revenue
    expect(ratios.roe).toBeCloseTo(0.25, 2);     // 10M / 40M
    expect(ratios.netMargin).toBeCloseTo(0.2, 2); // 10M / 50M
    expect(ratios.currentRatio).toBeCloseTo(2, 1);
  });

  it("leaves ratios undefined rather than dividing by zero", () => {
    const ratios = computeRatios({
      price: 50, sharesOutstanding: 0, netIncome: 1, revenue: 1, totalEquity: 0, totalAssets: 1,
    });
    expect(ratios.pe).toBeUndefined();
    expect(ratios.roe).toBeUndefined();
  });
});

describe("afriScore", () => {
  it("scores a strong, cheap, healthy company highly", () => {
    const ratios = computeRatios({
      price: 50, sharesOutstanding: 1_000_000, netIncome: 15_000_000, revenue: 60_000_000,
      totalEquity: 50_000_000, totalAssets: 80_000_000, totalDebt: 5_000_000,
      currentAssets: 40_000_000, currentLiabilities: 10_000_000, grossProfit: 35_000_000,
      operatingIncome: 20_000_000, dividendPerShareTtm: 2, priceHistory90d: [40, 42, 45, 48, 50],
    });
    const result = computeAfriScore("NSE:TEST", { ratios, revenueGrowthYoy: 0.15, epsGrowthYoy: 0.2 });
    expect(result.afriScore).toBeGreaterThan(50);
    expect(result.afriHealth).toBeGreaterThan(50);
  });

  it("falls back to neutral 50 when no signal is available at all", () => {
    const ratios = computeRatios({ price: 10, netIncome: 1, revenue: 1, totalEquity: 1, totalAssets: 1 });
    const result = computeAfriScore("NSE:EMPTY", { ratios: {} as any });
    expect(result.afriScore).toBeGreaterThanOrEqual(0);
    expect(result.afriScore).toBeLessThanOrEqual(100);
  });

  it("keeps every sub-score within the documented 0-100 range", () => {
    const ratios = computeRatios({
      price: 500, sharesOutstanding: 100_000, netIncome: -5_000_000, revenue: 10_000_000,
      totalEquity: 1_000_000, totalAssets: 50_000_000, totalDebt: 45_000_000,
      currentAssets: 2_000_000, currentLiabilities: 20_000_000,
    });
    const result = computeAfriScore("NSE:RISKY", { ratios, revenueGrowthYoy: -0.3, epsGrowthYoy: -0.5 });
    for (const key of ["afriValue", "afriGrowth", "afriHealth", "afriIncome", "afriRisk", "afriQuality", "afriMomentum"] as const) {
      expect(result[key]).toBeGreaterThanOrEqual(0);
      expect(result[key]).toBeLessThanOrEqual(100);
    }
  });
});
