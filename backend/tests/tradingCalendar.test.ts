import { describe, it, expect } from "vitest";
import { isMarketOpen, isTradingDay } from "../src/config/tradingCalendar.js";

// All times below are expressed as UTC instants chosen to land at known
// Africa/Nairobi (EAT, UTC+3) local times, so the test doesn't depend on
// the machine's local timezone.
describe("tradingCalendar (NSE)", () => {
  it("is open on a weekday during trading hours (Wed 10:00 EAT)", () => {
    const wedMorning = new Date("2026-02-04T07:00:00Z"); // 10:00 EAT
    expect(isMarketOpen("NSE", wedMorning)).toBe(true);
  });

  it("is closed on a weekday before the open (Wed 06:00 EAT)", () => {
    const wedEarly = new Date("2026-02-04T03:00:00Z"); // 06:00 EAT
    expect(isMarketOpen("NSE", wedEarly)).toBe(false);
  });

  it("is closed on a weekday after close (Wed 18:00 EAT)", () => {
    const wedEvening = new Date("2026-02-04T15:00:00Z"); // 18:00 EAT
    expect(isMarketOpen("NSE", wedEvening)).toBe(false);
  });

  it("is closed on a Saturday even during would-be trading hours", () => {
    const saturday = new Date("2026-02-07T07:00:00Z"); // Sat 10:00 EAT
    expect(isTradingDay("NSE", saturday)).toBe(false);
    expect(isMarketOpen("NSE", saturday)).toBe(false);
  });

  it("is closed on a configured public holiday even though it's a weekday", () => {
    const newYearsDay = new Date("2026-01-01T07:00:00Z"); // Thu, holiday, 10:00 EAT
    expect(isTradingDay("NSE", newYearsDay)).toBe(false);
  });

  it("treats an unregistered exchange as always open rather than blocking on a missing calendar", () => {
    // "JSE" is a valid ExchangeCode (future exchange) but has no calendar
    // entry yet — isMarketOpen should not block on that, just pass through.
    expect(isMarketOpen("UNKNOWN" as never, new Date())).toBe(true);
  });
});
