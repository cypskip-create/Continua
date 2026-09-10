import { describe, it, expect } from "vitest";
import { mapQuote, mapSecurity, mapCorporateAction, securityId } from "../src/adapters/nse/nseMapper.js";
import type { NseRawQuote, NseRawSecurity, NseRawCorporateAction } from "../src/adapters/nse/nseRawTypes.js";

describe("nseMapper", () => {
  it("maps a raw NSE quote into the standard schema", () => {
    const raw: NseRawQuote = {
      Symbol: "SCOM", LastTradedPrice: 12.85, Open: 12.70, High: 12.95, Low: 12.65, PrevClose: 12.70,
      Change: 0.15, ChangePct: 1.18, Volume: 8_100_000, Currency: "KES", TradingStatus: "ACTIVE",
      EventTimestamp: "2026-08-11T12:00:00", // no offset — EAT local
    };
    const quote = mapQuote(raw);
    expect(quote.securityId).toBe("NSE:SCOM");
    expect(quote.lastPrice).toBe(12.85);
    expect(quote.status).toBe("active");
    // EAT is UTC+3, so 12:00 local → 09:00 UTC
    expect(quote.timestamp).toBe("2026-08-11T09:00:00.000Z");
  });

  it("maps a raw security and derives a stable natural id", () => {
    const raw: NseRawSecurity = {
      Symbol: "EQTY", CompanyName: "Equity Group Holdings PLC", Sector: "Banking", Industry: "Diversified Banks",
      TradingStatus: "ACTIVE",
    };
    const security = mapSecurity(raw);
    expect(security.id).toBe(securityId("EQTY"));
    expect(security.exchange).toBe("NSE");
    expect(security.currency).toBe("KES");
  });

  it("maps a dividend corporate action into its discriminated-union details", () => {
    const raw: NseRawCorporateAction = {
      Symbol: "KCB", ActionType: "DIVIDEND", AnnouncedDate: "2026-03-01", Status: "COMPLETED",
      Payload: { AmountPerShare: 1.5, Currency: "KES", DividendType: "final" },
    };
    const action = mapCorporateAction(raw, "test-id-1");
    expect(action.type).toBe("dividend");
    expect(action.details).toEqual({ type: "dividend", amountPerShare: 1.5, currency: "KES", dividendType: "final" });
  });
});