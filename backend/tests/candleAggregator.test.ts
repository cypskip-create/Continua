import { describe, it, expect } from "vitest";
import { aggregateCandles } from "../src/services/analytics/candleAggregator.js";
import type { Candle } from "../src/types/market.js";

function makeDailyCandle(dateStr: string, open: number, high: number, low: number, close: number, volume = 1000): Candle {
  return { securityId: "NSE:TEST", interval: "1d", timestamp: new Date(`${dateStr}T00:00:00.000Z`).toISOString(), open, high, low, close, volume };
}

describe("aggregateCandles", () => {
  it("keeps Monday through Friday in the same trading week", () => {
    const daily = [5, 6, 7, 8, 9].map((day) => makeDailyCandle(`2026-01-0${day}`, 10, 12, 9, 11));
    const bars = aggregateCandles(daily, "1w");
    expect(bars).toHaveLength(1);
    expect(bars[0]!.timestamp).toBe("2026-01-05T00:00:00.000Z");
    expect(bars[0]!.volume).toBe(5000);
  });
  it("returns an empty array for empty input", () => {
    expect(aggregateCandles([], "1w")).toEqual([]);
  });

  it("rolls up daily candles into a single weekly bar with correct OHLCV", () => {
    const daily = [
      makeDailyCandle("2026-01-05", 10, 12, 9, 11, 100),  // Monday
      makeDailyCandle("2026-01-06", 11, 13, 10, 12, 200),
      makeDailyCandle("2026-01-07", 12, 14, 11, 13, 150),
    ];
    const weekly = aggregateCandles(daily, "1w");
    expect(weekly.length).toBe(1);
    expect(weekly[0]!.open).toBe(10);     // first day's open
    expect(weekly[0]!.close).toBe(13);    // last day's close
    expect(weekly[0]!.high).toBe(14);     // max across the bucket
    expect(weekly[0]!.low).toBe(9);       // min across the bucket
    expect(weekly[0]!.volume).toBe(450);  // sum across the bucket
  });

  it("produces separate buckets for days that fall in different months", () => {
    const daily = [
      makeDailyCandle("2026-01-30", 10, 11, 9, 10),
      makeDailyCandle("2026-02-02", 11, 12, 10, 11),
    ];
    const monthly = aggregateCandles(daily, "1M");
    expect(monthly.length).toBe(2);
  });

  it("preserves securityId on every derived bucket", () => {
    const daily = [makeDailyCandle("2026-01-05", 10, 11, 9, 10)];
    const weekly = aggregateCandles(daily, "1w");
    expect(weekly[0]!.securityId).toBe("NSE:TEST");
  });
});
