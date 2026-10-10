import { describe, expect, it } from "vitest";
import { HistoricalPriceRecordSchema } from "../src/ingestion/normalizers/historicalPriceRecord.js";
import { MarketResearchRecordSchema } from "../src/ingestion/normalizers/marketResearchRecord.js";
const row = { symbol: "SCOM", date: "2025-02-28", currency: "KES", open: 20, high: 23, low: 19, close: 22, volume: 100,
  sourceUrl: "https://www.nse.co.ke/report.pdf", permissionReference: "operator-held-licence", adjustment: "unadjusted" };
describe("verified history", () => {
  it("accepts sourced daily OHLC", () => expect(HistoricalPriceRecordSchema.safeParse(row).success).toBe(true));
  it.each([{ date: "2025-02-30" }, { high: 21 }, { low: 21 }, { permissionReference: "" }, { currency: "USD" }, { date: "2014-12-31" }])("rejects invalid historical observations %j", change => expect(HistoricalPriceRecordSchema.safeParse({ ...row, ...change }).success).toBe(false));
  it("does not manufacture OHLC from closing prices", () => { const { open, high, low, ...closeOnly } = row; expect(HistoricalPriceRecordSchema.safeParse(closeOnly).success).toBe(false); });
  it("gates NSE derivatives on written permission and requires contract metadata", () => {
    const derivative = { id: "contract:2025-02-28", kind: "derivative", title: "Fixture futures", observedAt: "2025-02-28T00:00:00Z", sourceUrl: row.sourceUrl,
      payload: { price: 22, expiry: "2025-03-21T00:00:00Z", isin: "KE0000000001", permissionReference: "licence" } };
    expect(MarketResearchRecordSchema.safeParse(derivative).success).toBe(true);
    expect(MarketResearchRecordSchema.safeParse({ ...derivative, payload: { ...derivative.payload, permissionReference: undefined } }).success).toBe(false);
  });
});
