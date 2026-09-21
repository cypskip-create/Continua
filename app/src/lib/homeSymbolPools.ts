/**
 * Single source of truth for the two hardcoded symbol pools the Home page
 * widgets feature (previously duplicated, near-identically, inside both
 * CommandCenterSections.tsx and QuickTradeWidget.tsx). Centralizing them
 * here is what lets Home.tsx fetch one shared quotes batch covering both,
 * instead of each widget firing its own separate request for its own
 * pool — see Home.tsx's `homeQuotes` for where that union happens.
 */

/** A canonical pool of tradable symbols (matches StockDetail's own
 *  dataset) to rank CommandCenterSections' "picks" from — so each
 *  section surfaces whichever stocks the underlying data actually
 *  supports today, instead of hand-picked symbols that might not even
 *  qualify (e.g. an "undervalued" pick with no upside). */
export const STOCK_POOL = ["SCOM", "EQTY", "KCB", "SCBK", "COOP", "EABL", "ABSA", "NCBA", "PORT", "BRIT", "KPLC", "BAT", "JUB", "DTK", "SBIC"];

/** Just the symbols QuickTradeWidget's marquee features — a subset of
 *  STOCK_POOL, kept as its own list since the marquee is deliberately
 *  narrower than the full pool CommandCenterSections ranks from. */
export const QUICK_SYMBOLS = ["SCOM", "EQTY", "KCB", "SCBK", "EABL", "COOP", "ABSA", "NCBA", "PORT", "BRIT", "KPLC"];