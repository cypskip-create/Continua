import { describe, it, expect } from "vitest";
import { summarizeNews } from "../src/services/research/newsDigest.js";
describe("grounded news summaries", () => {
  it("retains negation and figures and invents no recommendation", () => {
    const content = "The company did not increase its dividend this year. Revenue increased by 12 percent compared with last year. Management has not published a profit forecast.";
    const result = summarizeNews("Company results", content, null);
    expect(result.summary).toContain("did not increase");
    expect(result.summary).toContain("12 percent");
    expect(result.summary).toContain("has not published");
    expect(result.fullTextAvailable).toBe(true);
  });
  it("states when article content is unavailable", () => {
    const result = summarizeNews("Dividend announced", null, "A payout has been announced.");
    expect(result.summary).toBe("A payout has been announced.");
    expect(result.fullTextAvailable).toBe(false);
  });
  it("deduplicates repeated source sentences", () => {
    const sentence = "Revenue increased by 12 percent compared with last year.";
    expect(summarizeNews("Results", sentence + " " + sentence, null).summary).toBe(sentence);
  });
});
