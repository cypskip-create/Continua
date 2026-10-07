import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alignedReturns,
  correlation,
  trendScenario,
} from "../src/lib/marketMath.ts";
test("returns align dates, sort and exclude invalid prices", () => {
  const result = alignedReturns([
    {
      symbol: "A",
      candles: [
        { timestamp: "2026-01-02", close: 20 },
        { timestamp: "2026-01-01", close: 10 },
        { timestamp: "2026-01-03", close: 0 },
      ],
    },
    {
      symbol: "B",
      candles: [
        { timestamp: "2026-01-01", close: 50 },
        { timestamp: "2026-01-02", close: 75 },
        { timestamp: "2026-01-04", close: 80 },
      ],
    },
  ]);
  assert.deepEqual(result, [
    { date: "2026-01-01", A: 100, B: 100 },
    { date: "2026-01-02", A: 200, B: 150 },
  ]);
  assert.deepEqual(alignedReturns([]), []);
});
test("correlation handles constants and insufficient history", () => {
  assert.equal(correlation([1, 2, 3], [2, 4, 6]), 1);
  assert.equal(correlation([1, 1, 1], [1, 2, 3]), null);
  assert.equal(correlation([1], [2]), null);
});
test("scenario requires actual sufficient history and bounds its center", () => {
  assert.deepEqual(trendScenario([10, 11]), []);
  const scenario = trendScenario(Array.from({ length: 30 }, (_, i) => 100 + i));
  assert.equal(scenario.length, 5);
  assert.ok(scenario.every((s) => s.lower <= s.center && s.center <= s.upper));
});
