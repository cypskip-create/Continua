import { describe, expect, it } from "vitest";
import { CacheKeys } from "../src/storage/cache.js";

describe("market cache keys", () => {
  it("isolates identical tickers across exchanges", () => {
    expect(CacheKeys.quote("NSE", "ABC")).not.toBe(CacheKeys.quote("NGX", "ABC"));
    expect(CacheKeys.ratios("NSE", "ABC")).not.toBe(CacheKeys.ratios("NGX", "ABC"));
    expect(CacheKeys.afriScore("NSE", "ABC")).not.toBe(CacheKeys.afriScore("NGX", "ABC"));
  });

  it("isolates historical series across exchanges", () => {
    expect(CacheKeys.candles("NSE", "ABC", "1d", "2026-01-01", "2026-02-01"))
      .not.toBe(CacheKeys.candles("NGX", "ABC", "1d", "2026-01-01", "2026-02-01"));
  });
});
