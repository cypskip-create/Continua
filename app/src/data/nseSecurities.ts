/**
 * THE canonical list of NSE-listed securities Continua tracks.
 *
 * Every entry here is verified against Mansa's own /markets/exchanges/NSE/stocks
 * response (captured 2026-08-21). Do not hand-add a ticker to this file without
 * confirming it actually appears in that endpoint's response first — that's
 * exactly the mistake that caused Continua's database to accumulate Nigerian
 * Exchange tickers under the "NSE" label. If you're unsure whether a ticker
 * belongs here, re-fetch that endpoint and check before adding it.
 *
 * price/prevClose below are Mansa's real snapshot values at capture time, not
 * invented mock numbers — they'll drift from the real market over time, but
 * they're an honest starting point rather than fabricated placeholders.
 *
 * Two known real companies are deliberately NOT in this list:
 *   - BAMB (Bamburi Cement) — real, well-known, but simply not present in
 *     Mansa's NSE coverage as of the capture date. Demo/mock references to it
 *     elsewhere in the app were changed to PORT (also cement, also NSE-listed,
 *     and actually covered) rather than pointing at a ticker Mansa can't serve.
 *   - ARM (ARM Cement) and NBK (National Bank of Kenya) — both delisted /
 *     absorbed in real life (NBK was acquired by KCB in 2019), so their
 *     absence here also happens to be correct, not just an API limitation.
 *
 * THIS IS THE ONLY FILE THAT SHOULD CONTAIN HARDCODED TICKER/PRICE DATA.
 * Everything else in the app — components, pages, other data files — should
 * import from here (directly, or via lib/stockPrices.ts's helper functions)
 * rather than declaring its own ticker/price literals. If you find yourself
 * typing a ticker symbol next to a price number anywhere else, that's a sign
 * the data should be coming from here instead.
 */

export interface NseSecurityRecord {
  ticker: string;
  name: string;
  sector: string;
  /** Mansa snapshot price, KES, captured 2026-08-21T12:15:11Z */
  price: number;
  /** Derived as price - change from the same Mansa snapshot */
  prevClose: number;
}

export const NSE_SECURITIES: NseSecurityRecord[] = [
  { ticker: "ABSA", name: "Absa Bank Kenya Plc", sector: "Banking", price: 35, prevClose: 35.05 },
  { ticker: "AMAC", name: "Africa Mega Agricorp", sector: "Agriculture", price: 140, prevClose: 129.75 },
  { ticker: "BAT", name: "British American Tobacco Kenya", sector: "Manufacturing", price: 565, prevClose: 560 },
  { ticker: "BKG", name: "BK Group Plc", sector: "Banking", price: 62, prevClose: 62.25 },
  { ticker: "BOC", name: "BOC Kenya Ltd", sector: "Manufacturing", price: 191, prevClose: 198.25 },
  { ticker: "BRIT", name: "Britam Holdings Ltd", sector: "Insurance", price: 18.5, prevClose: 18.05 },
  { ticker: "CARB", name: "Carbacid Investments", sector: "Manufacturing", price: 47.8, prevClose: 48.7 },
  { ticker: "CGEN", name: "Car and General Kenya Ltd", sector: "Industrials", price: 335, prevClose: 372 },
  { ticker: "CIC", name: "CIC Insurance Group Ltd", sector: "Insurance", price: 4.74, prevClose: 4.69 },
  { ticker: "COOP", name: "Co-operative Bank of Kenya", sector: "Banking", price: 36.95, prevClose: 38.5 },
  { ticker: "CRWN", name: "Crown Paints Kenya Ltd", sector: "Manufacturing", price: 61.25, prevClose: 61.25 },
  { ticker: "CTUM", name: "Centum Investment Company", sector: "Investment", price: 17.65, prevClose: 17.25 },
  { ticker: "DTK", name: "Diamond Trust Bank Kenya Ltd", sector: "Banking", price: 174.75, prevClose: 171.25 },
  { ticker: "EABL", name: "East African Breweries Ltd", sector: "Manufacturing", price: 279, prevClose: 272 },
  { ticker: "EGAD", name: "Eaagads Ltd", sector: "Agriculture", price: 28.8, prevClose: 28.0 },
  { ticker: "EQTY", name: "Equity Group Holdings Ltd", sector: "Banking", price: 93.5, prevClose: 93.25 },
  { ticker: "EVRD", name: "Eveready East Africa Ltd", sector: "Manufacturing", price: 1.03, prevClose: 1.03 },
  { ticker: "FTGH", name: "Flame Tree Group Holdings", sector: "Manufacturing", price: 2.14, prevClose: 2.19 },
  { ticker: "GLD", name: "Absa NewGold ETF", sector: "Commodities", price: 5300, prevClose: 5240 },
  { ticker: "HAFR", name: "Home Afrika Ltd", sector: "Real Estate", price: 1.14, prevClose: 1.14 },
  { ticker: "HFCK", name: "HF Group", sector: "Banking", price: 11.8, prevClose: 11.95 },
  { ticker: "IMH", name: "I&M Holdings Plc", sector: "Banking", price: 80, prevClose: 74.75 },
  { ticker: "JUB", name: "Jubilee Holdings Ltd", sector: "Insurance", price: 417.75, prevClose: 415.5 },
  { ticker: "KAPC", name: "Kapchorua Tea Company Ltd", sector: "Agriculture", price: 340, prevClose: 335 },
  { ticker: "KCB", name: "KCB Group", sector: "Banking", price: 94.5, prevClose: 93 },
  { ticker: "KEGN", name: "KenGen Plc", sector: "Energy", price: 11.25, prevClose: 11.25 },
  { ticker: "KNRE", name: "Kenya Re-Insurance Corporation", sector: "Insurance", price: 3.78, prevClose: 3.61 },
  { ticker: "KPLC", name: "Kenya Power & Lighting Company", sector: "Energy", price: 21.1, prevClose: 21.05 },
  { ticker: "KQ", name: "Kenya Airways Ltd", sector: "Transportation", price: 5.68, prevClose: 5.68 },
  { ticker: "KUKZ", name: "Kakuzi Ltd", sector: "Agriculture", price: 430, prevClose: 420.5 },
  { ticker: "LBTY", name: "Liberty Kenya Holdings Ltd", sector: "Insurance", price: 9.5, prevClose: 9.18 },
  { ticker: "LIMT", name: "Limuru Tea Company Ltd", sector: "Agriculture", price: 496, prevClose: 525 },
  { ticker: "LKL", name: "Longhorn Publishers Ltd", sector: "Media", price: 2.9, prevClose: 2.69 },
  { ticker: "NBV", name: "Nairobi Business Ventures Ltd", sector: "Retail", price: 1.34, prevClose: 1.34 },
  { ticker: "NCBA", name: "NCBA Group Plc", sector: "Banking", price: 90.75, prevClose: 90.25 },
  { ticker: "NMG", name: "Nation Media Group", sector: "Media", price: 13, prevClose: 12.65 },
  { ticker: "NSE", name: "Nairobi Securities Exchange Ltd", sector: "Financial Services", price: 26, prevClose: 27.15 },
  { ticker: "OCH", name: "Olympia Capital Holdings Ltd", sector: "Investment", price: 8.38, prevClose: 8.36 },
  { ticker: "PORT", name: "East African Portland Cement", sector: "Construction", price: 116.5, prevClose: 119.5 },
  { ticker: "SASN", name: "Sasini Tea and Coffee Ltd", sector: "Agriculture", price: 24.5, prevClose: 24.35 },
  { ticker: "SBIC", name: "Stanbic Holdings Ltd", sector: "Banking", price: 270, prevClose: 275 },
  { ticker: "SCAN", name: "ScanGroup Ltd", sector: "Media", price: 2.1, prevClose: 2.08 },
  { ticker: "SCBK", name: "Standard Chartered Bank Kenya Ltd", sector: "Banking", price: 332, prevClose: 335.75 },
  { ticker: "SCOM", name: "Safaricom Plc", sector: "Telecommunications", price: 36.5, prevClose: 36.3 },
  { ticker: "SGL", name: "Standard Group Ltd", sector: "Media", price: 6.26, prevClose: 6.18 },
  { ticker: "SKL", name: "Shri Krishana Overseas Ltd", sector: "Manufacturing", price: 18, prevClose: 16.7 },
  { ticker: "SLAM", name: "Sanlam Allianz Holdings", sector: "Insurance", price: 10.2, prevClose: 9.76 },
  { ticker: "SMER", name: "Sameer Africa Plc", sector: "Manufacturing", price: 18.2, prevClose: 18.55 },
  { ticker: "SMWF", name: "Satrix MSCI World Feeder ETF", sector: "Commodities", price: 930, prevClose: 931 },
  { ticker: "TOTL", name: "Total Kenya Ltd", sector: "Energy", price: 44.95, prevClose: 44.6 },
  { ticker: "TPSE", name: "TPS Eastern Africa (Serena) Ltd", sector: "Hospitality", price: 15.9, prevClose: 15.0 },
  { ticker: "UCHM", name: "Uchumi Supermarket Ltd", sector: "Retail", price: 1.5, prevClose: 1.48 },
  { ticker: "UMME", name: "Umeme Ltd", sector: "Energy", price: 6.6, prevClose: 6.66 },
  { ticker: "UNGA", name: "Unga Group Ltd", sector: "Manufacturing", price: 34.5, prevClose: 34.1 },
  { ticker: "WTK", name: "Williamson Tea Kenya Ltd", sector: "Agriculture", price: 156.75, prevClose: 156.5 },
  { ticker: "XPRS", name: "Express Kenya Ltd", sector: "Transportation", price: 7, prevClose: 7.1 },
];

/**
 * Legacy/colloquial spellings still used in some UI copy, mapped to their
 * real Mansa ticker. getStockName/getStockSector/etc. in stockPrices.ts
 * resolve through this automatically — most call sites using the old
 * spelling don't need to be individually rewritten, they just keep working.
 */
export const LEGACY_TICKER_ALIASES: Record<string, string> = {
  SAFCOM: "SCOM",
  DTB: "DTK",
  STANBIC: "SBIC",
  KAKZ: "KUKZ",
  UMEME: "UMME",
  CARBACID: "CARB",
  SAMR: "SMER",
};

export const NSE_TICKERS: string[] = NSE_SECURITIES.map((s) => s.ticker);
export const NSE_TICKER_SET: Set<string> = new Set(NSE_TICKERS);