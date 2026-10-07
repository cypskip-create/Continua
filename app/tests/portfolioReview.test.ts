import test from "node:test";
import assert from "node:assert/strict";
import { reviewPortfolio, monthsToGoal } from "../src/lib/portfolioReview.ts";
test("allocation review isolates sector shocks and measures cap excess", () => {
  const rows = reviewPortfolio(
    [
      { symbol: "A", value: 700, weight: 0.7, sector: "Banking" },
      { symbol: "B", value: 300, weight: 0.3, sector: "Energy" },
    ],
    40,
    -10,
    "Banking",
  );
  assert.equal(rows[0].excessValue, 300);
  assert.equal(rows[0].scenarioChange, -70);
  assert.equal(rows[1].scenarioChange, 0);
  assert.equal(rows[1].overLimit, 0);
});
test("contribution planner never invents investment returns", () => {
  assert.equal(monthsToGoal(100, 200, 30), 4);
  assert.equal(monthsToGoal(100, 90, 0), 0);
  assert.equal(monthsToGoal(100, 200, 0), null);
});
