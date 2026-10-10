/** NSE company reference metadata. Current quotes must come from the live data layer. */

export interface NseSecurityRecord {
  ticker: string;
  name: string;
  sector: string;
}

export const NSE_SECURITIES: NseSecurityRecord[] = [
  { ticker: "ABSA", name: "Absa Bank Kenya Plc", sector: "Banking" },
  { ticker: "AMAC", name: "Africa Mega Agricorp", sector: "Agriculture" },
  { ticker: "BAT", name: "British American Tobacco Kenya", sector: "Manufacturing" },
  { ticker: "BKG", name: "BK Group Plc", sector: "Banking" },
  { ticker: "BOC", name: "BOC Kenya Ltd", sector: "Manufacturing" },
  { ticker: "BRIT", name: "Britam Holdings Ltd", sector: "Insurance" },
  { ticker: "CARB", name: "Carbacid Investments", sector: "Manufacturing" },
  { ticker: "CGEN", name: "Car and General Kenya Ltd", sector: "Industrials" },
  { ticker: "CIC", name: "CIC Insurance Group Ltd", sector: "Insurance" },
  { ticker: "COOP", name: "Co-operative Bank of Kenya", sector: "Banking" },
  { ticker: "CRWN", name: "Crown Paints Kenya Ltd", sector: "Manufacturing" },
  { ticker: "CTUM", name: "Centum Investment Company", sector: "Investment" },
  { ticker: "DTK", name: "Diamond Trust Bank Kenya Ltd", sector: "Banking" },
  { ticker: "EABL", name: "East African Breweries Ltd", sector: "Manufacturing" },
  { ticker: "EGAD", name: "Eaagads Ltd", sector: "Agriculture" },
  { ticker: "EQTY", name: "Equity Group Holdings Ltd", sector: "Banking" },
  { ticker: "EVRD", name: "Eveready East Africa Ltd", sector: "Manufacturing" },
  { ticker: "FTGH", name: "Flame Tree Group Holdings", sector: "Manufacturing" },
  { ticker: "GLD", name: "Absa NewGold ETF", sector: "Commodities" },
  { ticker: "HAFR", name: "Home Afrika Ltd", sector: "Real Estate" },
  { ticker: "HFCK", name: "HF Group", sector: "Banking" },
  { ticker: "IMH", name: "I&M Holdings Plc", sector: "Banking" },
  { ticker: "JUB", name: "Jubilee Holdings Ltd", sector: "Insurance" },
  { ticker: "KAPC", name: "Kapchorua Tea Company Ltd", sector: "Agriculture" },
  { ticker: "KCB", name: "KCB Group", sector: "Banking" },
  { ticker: "KEGN", name: "KenGen Plc", sector: "Energy" },
  { ticker: "KNRE", name: "Kenya Re-Insurance Corporation", sector: "Insurance" },
  { ticker: "KPLC", name: "Kenya Power & Lighting Company", sector: "Energy" },
  { ticker: "KQ", name: "Kenya Airways Ltd", sector: "Transportation" },
  { ticker: "KUKZ", name: "Kakuzi Ltd", sector: "Agriculture" },
  { ticker: "LBTY", name: "Liberty Kenya Holdings Ltd", sector: "Insurance" },
  { ticker: "LIMT", name: "Limuru Tea Company Ltd", sector: "Agriculture" },
  { ticker: "LKL", name: "Longhorn Publishers Ltd", sector: "Media" },
  { ticker: "NBV", name: "Nairobi Business Ventures Ltd", sector: "Retail" },
  { ticker: "NCBA", name: "NCBA Group Plc", sector: "Banking" },
  { ticker: "NMG", name: "Nation Media Group", sector: "Media" },
  { ticker: "NSE", name: "Nairobi Securities Exchange Ltd", sector: "Financial Services" },
  { ticker: "OCH", name: "Olympia Capital Holdings Ltd", sector: "Investment" },
  { ticker: "PORT", name: "East African Portland Cement", sector: "Construction" },
  { ticker: "SASN", name: "Sasini Tea and Coffee Ltd", sector: "Agriculture" },
  { ticker: "SBIC", name: "Stanbic Holdings Ltd", sector: "Banking" },
  { ticker: "SCAN", name: "ScanGroup Ltd", sector: "Media" },
  { ticker: "SCBK", name: "Standard Chartered Bank Kenya Ltd", sector: "Banking" },
  { ticker: "SCOM", name: "Safaricom Plc", sector: "Telecommunications" },
  { ticker: "SGL", name: "Standard Group Ltd", sector: "Media" },
  { ticker: "SKL", name: "Shri Krishana Overseas Ltd", sector: "Manufacturing" },
  { ticker: "SLAM", name: "Sanlam Allianz Holdings", sector: "Insurance" },
  { ticker: "SMER", name: "Sameer Africa Plc", sector: "Manufacturing" },
  { ticker: "SMWF", name: "Satrix MSCI World Feeder ETF", sector: "Commodities" },
  { ticker: "TOTL", name: "Total Kenya Ltd", sector: "Energy" },
  { ticker: "TPSE", name: "TPS Eastern Africa (Serena) Ltd", sector: "Hospitality" },
  { ticker: "UCHM", name: "Uchumi Supermarket Ltd", sector: "Retail" },
  { ticker: "UMME", name: "Umeme Ltd", sector: "Energy" },
  { ticker: "UNGA", name: "Unga Group Ltd", sector: "Manufacturing" },
  { ticker: "WTK", name: "Williamson Tea Kenya Ltd", sector: "Agriculture" },
  { ticker: "XPRS", name: "Express Kenya Ltd", sector: "Transportation" },
];

/** NSE research data. Coverage depends on the available sources; missing values remain unavailable. */
export const LEGACY_TICKER_ALIASES: Record<string, string> = {
  SCOM: "SCOM",
  DTB: "DTK",
  STANBIC: "SBIC",
  KAKZ: "KUKZ",
  UMEME: "UMME",
  CARBACID: "CARB",
  SAMR: "SMER",
};

export const NSE_TICKERS: string[] = NSE_SECURITIES.map((s) => s.ticker);
export const NSE_TICKER_SET: Set<string> = new Set(NSE_TICKERS);
