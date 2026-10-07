import { describe, expect, it } from "vitest";
import { MarketResearchRecordSchema } from "../src/ingestion/normalizers/marketResearchRecord.js";
const observation = {
  id: "cpi-fixture",
  kind: "macro",
  title: "Kenya CPI",
  observedAt: "2026-01-01T00:00:00Z",
  sourceUrl: "https://www.knbs.or.ke/cpi-and-inflation-rates/",
  payload: { actual: 4, indicator: "Inflation", unit: "%" },
};
describe("official market observation validation", () => {
  it("accepts dated official records", () => {
    expect(MarketResearchRecordSchema.safeParse(observation).success).toBe(
      true,
    );
  });
  it("rejects lookalike hosts, missing figures and invented calendar dates", () => {
    expect(
      MarketResearchRecordSchema.safeParse({
        ...observation,
        sourceUrl: "https://knbs.or.ke.fake.invalid/cpi",
      }).success,
    ).toBe(false);
    expect(
      MarketResearchRecordSchema.safeParse({
        ...observation,
        payload: { indicator: "Inflation", unit: "%" },
      }).success,
    ).toBe(false);
    expect(
      MarketResearchRecordSchema.safeParse({ ...observation, kind: "economic" })
        .success,
    ).toBe(false);
  });
});
