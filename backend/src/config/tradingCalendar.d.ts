/**
 * Per-exchange trading hours/days, so workers can stop polling a closed
 * market instead of ticking pointlessly (or, in mock mode, generating
 * unrealistic overnight/weekend "trading"). Uses Node's built-in Intl API
 * for timezone conversion rather than adding a date library dependency.
 *
 * The holiday list is a starting point, not a maintained data feed — NSE's
 * actual holiday calendar shifts (some Kenyan public holidays are declared
 * close to the date). Treat this as good-enough for dev/demo and revisit
 * before this matters for real trading decisions: either update it
 * annually, or move holidays into a `market.exchange_holidays` table fed
 * by the exchange adapter (the same way corporate actions already are).
 */
import type { ExchangeCode } from "./index.js";
export interface TradingCalendar {
    timezone: string;
    tradingWeekdays: Set<string>;
    openMinutes: number;
    closeMinutes: number;
    holidays: Set<string>;
}
export declare function isTradingDay(exchange: ExchangeCode, at?: Date): boolean;
export declare function isMarketOpen(exchange: ExchangeCode, at?: Date): boolean;
