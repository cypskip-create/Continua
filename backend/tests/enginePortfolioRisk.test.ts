import { expect, it } from "vitest";
import { portfolioRisk } from "../src/services/research/enginePortfolioRisk.js";
import {dailyCloseMap} from '../src/services/research/enginePortfolio.js';

function bars(start: number, length = 40) {
  return Array.from({ length }, (_, i) => ({ timestamp: new Date(Date.UTC(2026, 7, start + i)).toISOString(), close: 100 * Math.pow(1 + (i % 3 - 1) * 0.01, i) }));
}
it("aligns identical trading dates instead of matching different array positions", () => {
  const a = bars(1), b = bars(6).map(bar => ({ ...bar, close: a.find(p => p.timestamp === bar.timestamp)?.close ?? bar.close }));
  const result = portfolioRisk({ A: a, B: b }, { A: 0.5, B: 0.5 });
  expect(result.available).toBe(true); expect(result.observations).toBe(34);
  expect(result.metrics?.portfolioBeta).toBeCloseTo(1); expect(result.metrics?.portfolioVolatility).toBeCloseTo(result.metrics!.marketVolatility);
});
it('uses the last chronological close, not the last input row',()=>{
 expect(dailyCloseMap([{timestamp:'2026-10-01T15:00:00Z',close:110},{timestamp:'2026-10-01T09:00:00Z',close:100}]).get('2026-10-01')).toBe(110);
});
it("does not report risk for histories without twenty overlapping returns", () => {
  const result = portfolioRisk({ A: bars(1), B: bars(35) }, { A: 0.5, B: 0.5 });
  expect(result.available).toBe(false); expect(result.metrics).toBeNull();
});
it("excludes long missing-history intervals from daily annualization", () => {
  const history = [...bars(1, 22), ...bars(30, 22)];
  const result = portfolioRisk({ A: history }, { A: 0.6 });
  expect(result.excludedIntervals).toBe(1); expect(result.coveredWeight).toBe(0.6);
  expect(result.metrics?.sharpe).toBeNull(); expect(result.metrics?.sortino).toBeNull();
});
