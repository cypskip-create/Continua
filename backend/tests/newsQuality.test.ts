import { describe, expect, it } from "vitest";
import { canonicalNewsUrl, cleanArticleContent, dedupeNewsItems, isFinancialNews } from "../src/domain/newsQuality.js";
import type { NewsItem } from "../src/types/market.js";

const base: NewsItem = {
  id: "1", headline: "Bank earnings rise", excerpt: "Profit increased", articleUrl: "https://example.com/story?utm_source=x",
  source: "feed", sourceName: "Feed", category: "earnings", imageUrl: null, securityIds: ["a"], symbols: ["KCB"],
  scrapedArtifactId: null, scrapedExtractionId: null, extractionConfidence: 1, needsReview: false, publishedAt: null,
};

describe("news quality", () => {
  it("rejects unrelated accident coverage", () => expect(isFinancialNews("Salama Crash Leaves 17 Pilgrims Dead", "road accident")).toBe(false));
  it("keeps broad financial coverage", () => expect(isFinancialNews("Inflation slows as interest rates hold")).toBe(true));
  it("keeps linked company operations news", () => expect(isFinancialNews("Safaricom launches a new service", "Customers can subscribe today", true)).toBe(true));
  it("canonicalizes tracking URLs", () => expect(canonicalNewsUrl("https://www.example.com/story/?utm=x#top")).toBe("example.com/story"));
  it("removes duplicate titles and navigation clouds from reader text", () => {
    const text = cleanArticleContent("Bank profit rises", "Bank profit rises\nHome Factcheck Sports Lifestyle Careers Leadership\nReported profit rose by ten percent after stronger lending.");
    expect(text).toBe("Reported profit rose by ten percent after stronger lending.");
  });
  it("deduplicates syndicated stories and merges tickers", () => {
    const duplicate = { ...base, id: "2", articleUrl: "https://example.com/story", symbols: ["SCOM"] };
    const result = dedupeNewsItems([base, duplicate]);
    expect(result).toHaveLength(1);
    expect(result[0]?.symbols.sort()).toEqual(["KCB", "SCOM"]);
  });
});
