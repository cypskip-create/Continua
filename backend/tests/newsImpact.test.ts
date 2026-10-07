import { expect, it, vi } from "vitest";
vi.mock("../src/storage/db.js", () => ({ query: async () => ({ rows: [
  { securityId: "scom", symbol: "SCOM", companyName: "Safaricom PLC" },
  { securityId: "jub", symbol: "JUB", companyName: "Jubilee Holdings" },
  { securityId: "eqty", symbol: "EQTY", companyName: "Equity Group Holdings" },
] }) }));
import { resolveStockMentions } from "../src/ingestion/entityResolution/resolveStockMentions.js";
import { newsImpact } from "../src/services/research/newsImpact.js";
it("links M-Pesa regulation and Jubilee Health to their listed issuer", async () => {
  expect(await resolveStockMentions("M-Pesa must report cash theft to CBK", "", "NSE")).toEqual(["scom"]);
  expect(await resolveStockMentions("Jubilee Health wins insurance award", "", "NSE")).toEqual(["jub"]);
  expect(await resolveStockMentions("Equity capital increases", "", "NSE")).toEqual([]);
});
it("explains regulatory relevance without predicting price direction", () => {
  expect(newsImpact("M-Pesa must report cash theft to CBK", null, ["SCOM"])).toMatchObject({ topic: "Regulation & risk", symbols: ["SCOM"] });
  expect(newsImpact("General news", null, [])).toBeNull();
});
