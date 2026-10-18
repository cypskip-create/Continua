import { describe, it, expect } from "vitest";
import { computeAfriScore } from "../src/services/research/afriScore.js";
import { computeRatios, yoyGrowth } from "../src/services/research/ratiosEngine.js";

describe("ratiosEngine", () => {
  it('does not infer zero debt, cash, or earnings when values are missing',()=>{
    const basis={price:20,sharesOutstanding:100,ebitda:10,cash:5};
    expect(computeRatios(basis as any).evEbitda).toBeUndefined();
    expect(computeRatios({...basis,totalDebt:0} as any).evEbitda).toBe(199.5);
    expect(yoyGrowth(null as any,100)).toBeUndefined();
  });

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
  it("scores observed inputs using the Python Engine", async () => {
    const ratios = computeRatios({
      price: 50, sharesOutstanding: 1_000_000, netIncome: 15_000_000, revenue: 60_000_000,
      totalEquity: 50_000_000, totalAssets: 80_000_000, totalDebt: 5_000_000,
      currentAssets: 40_000_000, currentLiabilities: 10_000_000, grossProfit: 35_000_000,
      operatingIncome: 20_000_000, dividendPerShareTtm: 2, priceHistory90d: [40, 42, 45, 48, 50],
    });
    const result = await computeAfriScore("NSE:TEST", { ratios, revenueGrowthYoy: 0.15, epsGrowthYoy: 0.2 });
    expect(result.afriScore).toBeGreaterThan(50);
    expect(result.afriHealth).toBeGreaterThan(50);
  });

  it("leaves missing signals unavailable instead of neutral 50", async () => {
    const ratios = computeRatios({ price: 10, netIncome: 1, revenue: 1, totalEquity: 1, totalAssets: 1 });
    const result = await computeAfriScore("NSE:EMPTY", { ratios: {} as any });
    expect(result.afriScore).toBeNull();expect(result.afriHealth).toBeNull();
    expect(result.inputs.methodologyVersion).toBe('continua-c-score-v2');
  });

  it("keeps observed factors bounded and missing ones null", async () => {
    const ratios = computeRatios({
      price: 500, sharesOutstanding: 100_000, netIncome: -5_000_000, revenue: 10_000_000,
      totalEquity: 1_000_000, totalAssets: 50_000_000, totalDebt: 45_000_000,
      currentAssets: 2_000_000, currentLiabilities: 20_000_000,
    });
    const result = await computeAfriScore("NSE:RISKY", { ratios, revenueGrowthYoy: -0.3, epsGrowthYoy: -0.5 });
    for (const key of ["afriValue", "afriGrowth", "afriHealth", "afriIncome", "afriRisk", "afriQuality", "afriMomentum"] as const) {
      if (result[key] != null) {expect(result[key]).toBeGreaterThanOrEqual(0);expect(result[key]).toBeLessThanOrEqual(100);}
    }
  });
  it('does not substitute generic debt or liquidity for bank regulatory evidence', async()=>{
    const result=await computeAfriScore('NSE:BANK',{sector:'Banking',ratios:{pe:8,pb:1,roe:.2,roa:.02,currentRatio:10,debtToEquity:0}});
    expect(result.afriHealth).toBeNull();expect(result.afriScore).toBeNull();expect(result.inputs.sectorProfile).toBe('bank');
  });
  it('does not treat a loss-making negative earnings multiple as cheap',async()=>{
    const result=await computeAfriScore('NSE:LOSS',{ratios:{pe:-10}});expect(result.afriValue).toBeNull();expect(result.afriScore).toBeNull();
  });
});
