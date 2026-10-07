import { expect, it } from "vitest";
import { buildCompanyBriefing } from "../src/services/research/engineBriefing.js";
import { dividendDiscountModel } from "../src/services/technical/valuationService.js";
import type { CorporateAction } from "../src/types/market.js";
it("calculates loss-to-profit growth using the magnitude of the prior loss", () => {
  const result = buildCompanyBriefing({ symbol: "KCB", latest: { fiscalYear: 2026, revenue: 120, netIncome: 10, eps: null }, prior: { fiscalYear: 2025, revenue: 100, netIncome: -10, eps: null } });
  expect(result.facts).toContain("Net income increased 200.0% in FY2026 versus FY2025.");
  expect(result.facts).toHaveLength(2);
});
it("does not invent growth across missing years or missing inputs", () => {
  expect(buildCompanyBriefing({ symbol: "KCB", latest: { fiscalYear: 2026, revenue: 100, netIncome: null, eps: null }, prior: { fiscalYear: 2024, revenue: 50, netIncome: null, eps: null } }).facts).toEqual([]);
});
const dividend = (exDate: string, amount: number, status: CorporateAction["status"] = "completed"): CorporateAction => ({ id: exDate, securityId: "NSE:KCB", type: "dividend", announcedAt: exDate, exDate, status, details: { type: "dividend", amountPerShare: amount, currency: "KES", dividendType: "final" } });
it("supports annual dividend payers without treating four years as TTM", () => {
  const model = dividendDiscountModel(30, [dividend("2026-04-01", 2), dividend("2025-04-01", 2), dividend("2024-04-01", 20), dividend("2026-06-01", 100, "cancelled")], new Date("2026-10-07"));
  expect(model.inputs.ttmDividend).toBe(2);
  expect(model.inputs.estimatedGrowthRatePercent).toBe(0);
  expect(model.fairValue).toBe(16.67);
});
it("does not assume dividend growth without prior-year coverage", () => {
  expect(dividendDiscountModel(30, [dividend("2026-04-01", 2)], new Date("2026-10-07")).fairValue).toBeNull();
});
