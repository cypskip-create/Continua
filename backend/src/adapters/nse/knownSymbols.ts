/**
 * The real NSE ticker symbols this codebase already tracks (same list as
 * nseClient.ts's MockNseClient SEED, symbols only — kept in its own file,
 * not exported from nseClient.ts, so afxClient.ts can import just the
 * symbol directory without a circular import: nseClient.ts imports
 * AfxClient to wire it into createNseClient(), so AfxClient can't import
 * anything back from nseClient.ts).
 *
 * Used as a directory of "which tickers exist" for clients (like
 * AfxClient) that have no verified way to enumerate the market
 * themselves — NOT a source of prices or financials, which live only in
 * nseClient.ts's SEED and are irrelevant here.
 */
export const KNOWN_NSE_SYMBOLS: string[] = [
  // Banking
  "SCBK", "ABSA", "BKG", "COOP", "DTB", "EQTY", "FMLY", "HFCB", "IMH",
  "KCB", "NCBA", "STANBIC",
  // Telecommunication
  "SCOM",
  // Insurance
  "BRIT", "CIC", "JUB", "KNRE", "LBTY", "SLAM",
  // Manufacturing & Allied
  "AMAC", "BOC", "BAT", "CARB", "EABL", "FTGH", "MSC", "SKL", "UNGA",
  // Energy & Petroleum
  "KEGN", "KPC", "KPLC", "TOTL", "UMME",
  // Construction & Allied
  "ARM", "BAMB", "CRWN", "CABL", "PORT",
  // Agricultural
  "EGAD", "KUKZ", "KAPC", "LIMT", "SASN", "WTK",
  // Commercial & Services
  "DCON", "EVRD", "XPRS", "HBE", "KQ", "LKL", "NBV", "NMG", "SMER",
  "SGL", "TPSE", "UCHM", "SCAN",
  // Investment
  "CTUM", "HAFR", "KURV", "OCH", "TCL",
  // Investment Services (the exchange itself)
  "NSE",
  // Automobiles & Accessories
  "CGEN",
  // Real Estate Investment Trusts
  "ALP", "LAPR", "TRFC",
  // Exchange Traded Funds
  "GLD", "SMWF",
];