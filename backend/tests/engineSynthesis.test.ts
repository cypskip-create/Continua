import { it, expect } from "vitest";
import { buildResearchSynthesis } from "../src/services/research/engineSynthesis.js";
it("keeps momentum extremes separate from recommendations and includes missing feeds", () => {
  const result = buildResearchSynthesis(50, [{type:"RSI",latest:75,timestamps:["2026-10-06"]},{type:"SMA",latest:55,timestamps:["2026-10-06"]}], ["Net loss reported"], ["News"]);
  expect(result.observations[0]?.text).toContain("not a reversal signal");
  expect(result.observations[1]?.text).toContain("below");
  expect(result.observations[0]?.asOf).toBe("2026-10-06");
  expect(result.checklist).toHaveLength(2);
});
it("does not invent indicators when history or values are missing", () => {
  expect(buildResearchSynthesis(null, [{type:"RSI",latest:null,timestamps:[]}], [], []).observations).toEqual([]);
});
