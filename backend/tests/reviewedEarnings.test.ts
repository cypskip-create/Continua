import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../src/storage/db.js", () => ({ query: mocks.query }));
import { corporateActionsRepository } from "../src/storage/repositories/corporateActionsRepository.js";
afterEach(() => vi.resetAllMocks());

it("uses reviewed statements for earnings actuals without falling back to stale calendar EPS", async () => {
  mocks.query.mockResolvedValue({rows:[{fiscalYear:2016,epsActual:null,revenueActual:195680000000},{fiscalYear:2026,epsActual:2.39}]});
  const rows = await corporateActionsRepository.getEarningsBySecurity("NSE:SCOM");
  const sql = mocks.query.mock.calls[0]![0];
  expect(sql).toContain("market.filing_history_reviews");
  expect(sql).toContain("CASE WHEN reviewed.id IS NOT NULL THEN reviewed.eps ELSE ee.eps_actual END");
  expect(sql).toContain("p.fiscal_quarter IS NOT DISTINCT FROM ee.fiscal_quarter");
  expect(sql).toContain("p.period_end <= CURRENT_DATE");
  expect(sql).toContain("THEN reviewed.reported_at ELSE ee.reported_date END");
  expect(rows).toHaveLength(2);
  expect(rows.find(row => row.fiscalYear === 2016)?.epsActual).toBeNull();
});

it("applies the same canonical earnings policy to market-wide cards", async () => {
  mocks.query.mockResolvedValue({rows:[]});
  await corporateActionsRepository.getRecentEarnings("NSE",20);
  const sql = mocks.query.mock.calls[0]![0];
  expect(sql).toContain("LEFT JOIN LATERAL");
  expect(sql).toContain("THEN reviewed.revenue ELSE ee.revenue_actual END");
  expect(sql).toContain("sec.status <> 'delisted'");
  expect(sql).toContain("ee.reported_date <= CURRENT_DATE");
});
