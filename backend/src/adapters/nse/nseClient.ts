/**
 * The low-level transport client for NSE data. This is the ONLY file in the
 * whole system that should ever know an HTTP endpoint, an API key, or a
 * provider-specific auth header. Two implementations:
 *
 *  - MockNseClient   → realistic synthetic data, zero external dependency.
 *                      Lets every layer above (ingestion → storage → API →
 *                      app) be built and tested today, before a licensed
 *                      feed is signed.
 *  - RealNseClient   → scaffold for the actual licensed/authorized NSE feed.
 *                      Wire in the real base URL, auth, and endpoint paths
 *                      when that contract exists. Nothing else in the
 *                      system needs to change when you do — just flip
 *                      NSE_CLIENT_MODE=live in .env.
 */
import { env } from "../../config/index.js";
import { logger } from "../../monitoring/logger.js";
import https from "node:https";
import type {
  NseRawSecurity, NseRawQuote, NseRawCandle, NseRawCompanyProfile,
  NseRawFinancialPeriod, NseRawCorporateAction, NseRawEarningsEvent, NseRawOwnership,
} from "./nseRawTypes.js";
import { AfxClient } from "../afx/afxClient.js";
import { MyStocksClient } from "../mystocks/mystocksClient.js";

export interface INseClient {
  fetchSecurities(): Promise<NseRawSecurity[]>;
  fetchQuotes(symbols: string[]): Promise<NseRawQuote[]>;
  fetchCandles(symbol: string, interval: NseRawCandle["Interval"], from: string, to: string): Promise<NseRawCandle[]>;
  fetchCompanyProfile(symbol: string): Promise<NseRawCompanyProfile | null>;
  fetchFinancials(symbol: string): Promise<NseRawFinancialPeriod[]>;
  fetchCorporateActions(symbol: string | null, since: string): Promise<NseRawCorporateAction[]>;
  fetchEarningsEvents(symbol: string | null, since: string): Promise<NseRawEarningsEvent[]>;
  fetchOwnership(symbol: string): Promise<NseRawOwnership[]>;
  /** Long-lived tick subscription. Returns an unsubscribe function. */
  streamQuotes(symbols: string[], onTick: (q: NseRawQuote) => void): () => void;
}

/* ────────────────────────────────────────────────────────────────────── */
/* Mock client — seeded synthetic NSE market, one row per real NSE ticker */
/* ────────────────────────────────────────────────────────────────────── */

interface SeedRow {
  symbol: string; company: string; sector: string; industry: string;
  isin: string; basePrice: number; currency: string;
  /** Shares outstanding, in millions — calibrated so price × sharesOutM
   *  lands near each company's real-world market cap, so quotes,
   *  fundamentals, and screener market caps all stay internally consistent
   *  instead of each inventing its own scale. */
  sharesOutM: number;
}

const SEED: SeedRow[] = [
  { symbol: "SAFCOM", company: "Safaricom PLC", sector: "Telecommunications", industry: "Wireless Telecom", isin: "KE1000001917", basePrice: 12.85, currency: "KES", sharesOutM: 40093 },
  { symbol: "EQTY", company: "Equity Group Holdings PLC", sector: "Banking", industry: "Diversified Banks", isin: "KE0000000315", basePrice: 62.50, currency: "KES", sharesOutM: 3797 },
  { symbol: "KCB", company: "KCB Group PLC", sector: "Banking", industry: "Diversified Banks", isin: "KE0000000067", basePrice: 45.75, currency: "KES", sharesOutM: 3218 },
  { symbol: "COOP", company: "Co-operative Bank of Kenya", sector: "Banking", industry: "Diversified Banks", isin: "KE0000000596", basePrice: 17.25, currency: "KES", sharesOutM: 5884 },
  { symbol: "SCBK", company: "Standard Chartered Bank Kenya", sector: "Banking", industry: "Diversified Banks", isin: "KE0000000208", basePrice: 185.00, currency: "KES", sharesOutM: 788 },
  { symbol: "ABSA", company: "ABSA Bank Kenya PLC", sector: "Banking", industry: "Diversified Banks", isin: "KE0000000554", basePrice: 14.80, currency: "KES", sharesOutM: 5439 },
  { symbol: "NCBA", company: "NCBA Group PLC", sector: "Banking", industry: "Diversified Banks", isin: "KE0000000901", basePrice: 52.25, currency: "KES", sharesOutM: 1650 },
  { symbol: "DTB", company: "Diamond Trust Bank Kenya", sector: "Banking", industry: "Diversified Banks", isin: "KE0000000133", basePrice: 68.50, currency: "KES", sharesOutM: 280 },
  { symbol: "STANBIC", company: "Stanbic Holdings PLC", sector: "Banking", industry: "Diversified Banks", isin: "KE0000000174", basePrice: 125.00, currency: "KES", sharesOutM: 396 },
  { symbol: "BRIT", company: "Britam Holdings PLC", sector: "Insurance", industry: "Multi-line Insurance", isin: "KE0000000729", basePrice: 6.80, currency: "KES", sharesOutM: 2529 },
  { symbol: "JUB", company: "Jubilee Holdings Ltd", sector: "Insurance", industry: "Multi-line Insurance", isin: "KE0000000042", basePrice: 245.00, currency: "KES", sharesOutM: 72 },
  { symbol: "EABL", company: "East African Breweries Ltd", sector: "Manufacturing & Allied", industry: "Beverages", isin: "KE0000000026", basePrice: 178.50, currency: "KES", sharesOutM: 792 },
  { symbol: "BAT", company: "British American Tobacco Kenya", sector: "Manufacturing & Allied", industry: "Tobacco", isin: "KE0000000059", basePrice: 425.00, currency: "KES", sharesOutM: 100 },
  { symbol: "KPLC", company: "Kenya Power & Lighting Co.", sector: "Energy & Petroleum", industry: "Electric Utilities", isin: "KE0000000083", basePrice: 2.85, currency: "KES", sharesOutM: 1930 },
  { symbol: "KEGN", company: "KenGen PLC", sector: "Energy & Petroleum", industry: "Independent Power Producers", isin: "KE0000000117", basePrice: 4.25, currency: "KES", sharesOutM: 6588 },
  { symbol: "TOTL", company: "TotalEnergies Marketing Kenya", sector: "Energy & Petroleum", industry: "Oil & Gas Marketing", isin: "KE0000000141", basePrice: 28.50, currency: "KES", sharesOutM: 179 },
  { symbol: "BAMB", company: "Bamburi Cement PLC", sector: "Construction & Allied", industry: "Building Materials", isin: "KE0000000232", basePrice: 32.75, currency: "KES", sharesOutM: 363 },
];

/** Deterministic string hash → seed, so re-runs are stable/testable. */
function seedFrom(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** In-memory "current tape" so successive quote calls drift realistically
 *  instead of being independently re-randomized every call. */
const liveTape = new Map<string, { price: number; prevClose: number; rng: () => number }>();

function tapeFor(symbol: string): { price: number; prevClose: number; rng: () => number } {
  let t = liveTape.get(symbol);
  if (!t) {
    const seed = SEED.find((s) => s.symbol === symbol);
    const base = seed?.basePrice ?? 10;
    t = { price: base, prevClose: base, rng: mulberry32(seedFrom(symbol)) };
    liveTape.set(symbol, t);
  }
  return t;
}

function tickPrice(symbol: string): NseRawQuote {
  const seed = SEED.find((s) => s.symbol === symbol);
  if (!seed) throw new Error(`Unknown mock symbol: ${symbol}`);
  const t = tapeFor(symbol);
  const drift = (t.rng() - 0.5) * 0.006; // ±0.3% per tick
  t.price = Math.max(0.05, t.price * (1 + drift));
  const change = t.price - t.prevClose;
  const changePct = (change / t.prevClose) * 100;
  return {
    Symbol: symbol,
    LastTradedPrice: round2(t.price),
    Open: round2(t.prevClose),
    High: round2(Math.max(t.price, t.prevClose) * 1.01),
    Low: round2(Math.min(t.price, t.prevClose) * 0.99),
    PrevClose: round2(t.prevClose),
    Change: round2(change),
    ChangePct: round2(changePct),
    Volume: Math.floor(50_000 + t.rng() * 2_000_000),
    Bid: round2(t.price * 0.999),
    Ask: round2(t.price * 1.001),
    MarketCapMn: round2(t.price * seed.sharesOutM),
    Currency: seed.currency,
    TradingStatus: "ACTIVE",
    EventTimestamp: new Date().toISOString(),
  };
}
function round2(n: number) { return Math.round(n * 100) / 100; }

export class MockNseClient implements INseClient {
  async fetchSecurities(): Promise<NseRawSecurity[]> {
    return SEED.map((s) => ({
      Symbol: s.symbol,
      ISIN: s.isin,
      CompanyName: s.company,
      Sector: s.sector,
      Industry: s.industry,
      ListingDate: "1990-01-01",
      TradingStatus: "ACTIVE",
    }));
  }

  async fetchQuotes(symbols: string[]): Promise<NseRawQuote[]> {
    const targets = symbols.length ? symbols : SEED.map((s) => s.symbol);
    return targets.filter((sym) => SEED.some((s) => s.symbol === sym)).map(tickPrice);
  }

  async fetchCandles(symbol: string, interval: NseRawCandle["Interval"], from: string, to: string): Promise<NseRawCandle[]> {
    const seed = SEED.find((s) => s.symbol === symbol);
    if (!seed) return [];
    const rng = mulberry32(seedFrom(`${symbol}:${interval}:${from}:${to}`));
    const stepMs = intervalToMs(interval);
    const fromMs = new Date(from).getTime();
    const toMs = new Date(to).getTime();
    const bars: NseRawCandle[] = [];
    let price = seed.basePrice * (0.85 + rng() * 0.3);
    for (let t = fromMs; t <= toMs; t += stepMs) {
      const open = price;
      const drift = (rng() - 0.48) * 0.02;
      price = Math.max(0.05, price * (1 + drift));
      const close = price;
      const high = Math.max(open, close) * (1 + rng() * 0.005);
      const low = Math.min(open, close) * (1 - rng() * 0.005);
      bars.push({
        Symbol: symbol, Interval: interval, BarTime: new Date(t).toISOString(),
        O: round2(open), H: round2(high), L: round2(low), C: round2(close),
        V: Math.floor(20_000 + rng() * 800_000),
      });
    }
    return bars;
  }

  async fetchCompanyProfile(symbol: string): Promise<NseRawCompanyProfile | null> {
    const seed = SEED.find((s) => s.symbol === symbol);
    if (!seed) return null;
    return {
      Symbol: symbol,
      Description: `${seed.company} is listed on the Nairobi Securities Exchange in the ${seed.sector} sector.`,
      Headquarters: "Nairobi, Kenya",
      ChiefExecutive: "N/A",
      EmployeeCount: "N/A",
      FoundedYear: "N/A",
      Website: undefined,
    };
  }

  async fetchFinancials(symbol: string): Promise<NseRawFinancialPeriod[]> {
    const seed = SEED.find((s) => s.symbol === symbol);
    if (!seed) return [];
    const rng = mulberry32(seedFrom(`${symbol}:fin`));
    const periods: NseRawFinancialPeriod[] = [];
    const currentYear = new Date().getFullYear();
    // Shares outstanding is the SAME figure (within small noise) used for
    // market cap in the live quote generator, and held roughly constant
    // across fiscal years — real companies don't reprice their share count
    // annually. Deriving netIncome from a target PE (rather than an
    // unrelated revenue formula) is what keeps PE/PB/EPS in a realistic
    // range: this is synthetic data whose entire point is to exercise the
    // real calculation pipeline with numbers that look like real numbers.
    const sharesOutstanding = Math.floor(seed.sharesOutM * 1_000_000 * (0.97 + rng() * 0.06));
    const targetPe = 6 + rng() * 14; // 6x-20x, a realistic NSE range
    for (let yearsAgo = 2; yearsAgo >= 0; yearsAgo--) {
      const fy = currentYear - yearsAgo;
      const growthFactor = 0.85 + (2 - yearsAgo) * 0.075; // older years earned proportionally less
      const eps = round2((seed.basePrice / targetPe) * growthFactor);
      const netIncome = round2(eps * sharesOutstanding);
      const netMargin = 0.08 + rng() * 0.15;
      const revenue = round2(netIncome / netMargin);
      periods.push({
        Symbol: symbol, PeriodType: "ANNUAL", FiscalYear: fy,
        PeriodEndDate: `${fy}-12-31`, ReportedDate: `${fy + 1}-03-15`, Currency: seed.currency,
        Revenue: revenue, CostOfRevenue: round2(revenue * 0.55), GrossProfit: round2(revenue * 0.45),
        OperatingExpenses: round2(revenue * 0.2), OperatingIncome: round2(revenue * 0.25),
        NetIncome: netIncome, EPS: eps, DilutedEPS: round2(eps * 0.98),
        EBITDA: round2(revenue * 0.3),
        TotalAssets: round2(revenue * 2.2), TotalLiabilities: round2(revenue * 1.3),
        TotalEquity: round2(revenue * 0.9), Cash: round2(revenue * 0.15), TotalDebt: round2(revenue * 0.5),
        CurrentAssets: round2(revenue * 0.8), CurrentLiabilities: round2(revenue * 0.5),
        SharesOutstanding: sharesOutstanding,
        OperatingCashFlow: round2(netIncome * 1.2), InvestingCashFlow: round2(-revenue * 0.1),
        FinancingCashFlow: round2(-revenue * 0.05), FreeCashFlow: round2(netIncome * 0.9), Capex: round2(revenue * 0.08),
      });
    }
    return periods;
  }

  async fetchCorporateActions(symbol: string | null, _since: string): Promise<NseRawCorporateAction[]> {
    const targets = symbol ? SEED.filter((s) => s.symbol === symbol) : SEED;
    const year = new Date().getFullYear();
    return targets.flatMap((s): NseRawCorporateAction[] => {
      const rng = mulberry32(seedFrom(`${s.symbol}:ca`));
      const dividendPerShare = round2(s.basePrice * (0.01 + rng() * 0.04));
      return [{
        Symbol: s.symbol, ActionType: "DIVIDEND",
        AnnouncedDate: `${year}-03-01`, ExDate: `${year}-05-15`, RecordDate: `${year}-05-16`, PayDate: `${year}-07-01`,
        Status: "COMPLETED",
        Payload: { AmountPerShare: dividendPerShare, Currency: s.currency, DividendType: "final" },
      }];
    });
  }

  async fetchEarningsEvents(symbol: string | null, _since: string): Promise<NseRawEarningsEvent[]> {
    const targets = symbol ? SEED.filter((s) => s.symbol === symbol) : SEED;
    const year = new Date().getFullYear();
    return targets.map((s) => {
      const rng = mulberry32(seedFrom(`${s.symbol}:earn`));
      const epsEstimate = round2(s.basePrice * 0.08 * (0.9 + rng() * 0.2));
      return {
        Symbol: s.symbol, FiscalYear: year, FiscalQuarter: undefined,
        ExpectedDate: `${year}-03-15`, ReportedDate: `${year}-03-15`,
        EpsEstimate: epsEstimate, EpsActual: round2(epsEstimate * (0.92 + rng() * 0.16)),
      };
    });
  }

  async fetchOwnership(symbol: string): Promise<NseRawOwnership[]> {
    const seed = SEED.find((s) => s.symbol === symbol);
    if (!seed) return [];
    return [
      { Symbol: symbol, HolderName: "Government of Kenya", HolderType: "GOVERNMENT", SharesHeld: 0, PercentHeld: 15.0, AsOfDate: new Date().toISOString() },
      { Symbol: symbol, HolderName: "Local Institutions", HolderType: "INSTITUTION", SharesHeld: 0, PercentHeld: 38.0, AsOfDate: new Date().toISOString() },
      { Symbol: symbol, HolderName: "Foreign Institutions", HolderType: "INSTITUTION", SharesHeld: 0, PercentHeld: 22.0, AsOfDate: new Date().toISOString() },
      { Symbol: symbol, HolderName: "Public / Retail", HolderType: "PUBLIC", SharesHeld: 0, PercentHeld: 25.0, AsOfDate: new Date().toISOString() },
    ];
  }

  streamQuotes(symbols: string[], onTick: (q: NseRawQuote) => void): () => void {
    const targets = symbols.length ? symbols : SEED.map((s) => s.symbol);
    const interval = setInterval(() => {
      for (const sym of targets) {
        if (SEED.some((s) => s.symbol === sym)) onTick(tickPrice(sym));
      }
    }, env.PRICE_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }
}

function intervalToMs(interval: NseRawCandle["Interval"]): number {
  switch (interval) {
    case "1MIN": return 60_000;
    case "5MIN": return 5 * 60_000;
    case "15MIN": return 15 * 60_000;
    case "1HR": return 60 * 60_000;
    case "1D": return 24 * 60 * 60_000;
    case "1W": return 7 * 24 * 60 * 60_000;
    case "1MO": return 30 * 24 * 60 * 60_000;
    case "1Y": return 365 * 24 * 60 * 60_000;
  }
}

/* ────────────────────────────────────────────────────────────────────── */
/* Real client — Mansa's current test feed exposes pan-African movers. */

interface MansaMover {
  ticker: string;
  name: string;
  price: number;
  change: number | null;
  change_pct: number | null;
  volume: number | null;
  exchange?: string;
  exchange_code?: string;
  currency?: string;
  last_updated: string;
}

interface MansaMoversResponse {
  success: boolean;
  data: { gainers: MansaMover[]; losers: MansaMover[] };
}
/* ────────────────────────────────────────────────────────────────────── */

export class RealNseClient implements INseClient {
  private baseUrl: string;
  private apiKey: string;
  private apiIp?: string;

  constructor() {
    const baseUrl = env.MANSA_API_BASE_URL || env.NSE_API_BASE_URL;
    const apiKey = env.MANSA_API_KEY || env.NSE_API_KEY;
    if (!baseUrl || !apiKey) {
      throw new Error(
        "The live market-data client requires MANSA_API_BASE_URL and MANSA_API_KEY. " +
        "Set NSE_CLIENT_MODE=mock in .env until a licensed feed is contracted."
      );
    }
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.apiIp = env.MANSA_API_IP;
  }

  private async request<T>(url: string): Promise<T> {
    const target = new URL(url);
    const response = await new Promise<{ statusCode?: number; contentType?: string; body: string }>((resolve, reject) => {
      const request = https.request({
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || 443,
        path: `${target.pathname}${target.search}`,
        servername: target.hostname,
        lookup: this.apiIp
          ? (_hostname, options, callback) => {
            if (options.all) callback(null, [{ address: this.apiIp!, family: 4 }]);
            else callback(null, this.apiIp!, 4);
          }
          : undefined,
        headers: {
          Host: target.host,
          Accept: "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          "X-API-Key": this.apiKey,
        },
      }, (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => { body += chunk; });
        res.on("end", () => resolve({
          statusCode: res.statusCode,
          contentType: res.headers["content-type"],
          body,
        }));
      });
      request.on("error", reject);
      request.end();
    });
    if (response.statusCode !== 200) throw new Error(`Mansa request failed: ${response.statusCode ?? "unknown"}`);
    if (!response.contentType?.includes("application/json")) {
      throw new Error(`Mansa returned ${response.contentType ?? "an unknown content type"}; check MANSA_API_BASE_URL or MANSA_API_IP`);
    }
    return JSON.parse(response.body) as T;
  }

  private async fetchMovers(): Promise<MansaMover[]> {
    const response = await this.request<MansaMoversResponse>(this.baseUrl);
    if (!response.success) throw new Error("Mansa returned an unsuccessful response");
    return [...response.data.gainers, ...response.data.losers];
  }

  async fetchSecurities(): Promise<NseRawSecurity[]> {
    const movers = await this.fetchMovers();
    const unique = new Map(movers.map((mover) => [mover.ticker, mover]));
    return [...unique.values()].map((mover) => ({
      Symbol: mover.ticker,
      CompanyName: mover.name,
      Sector: "Unknown",
      Industry: "Unknown",
      TradingStatus: "ACTIVE",
    }));
  }

  async fetchQuotes(symbols: string[]): Promise<NseRawQuote[]> {
    const requested = new Set(symbols.map((symbol) => symbol.toUpperCase()));
    const movers = await this.fetchMovers();
    const matched = movers.filter((mover) => !requested.size || requested.has(mover.ticker.toUpperCase()));

    // TEMPORARY — remove once we've confirmed whether Mansa's movers feed
    // ever actually includes our tracked NSE symbols. Prices staying frozen
    // at seed values despite successful (200 OK) polls points to `matched`
    // being empty every time, meaning the free-tier movers endpoint simply
    // never surfaces these tickers — not a bug in this filter itself.
    logger.info(
      { requestedCount: requested.size, moversReturned: movers.length, matchedCount: matched.length, moversTickers: movers.map((m) => m.ticker) },
      "Mansa movers vs requested NSE symbols",
    );

    return matched
      .map((mover) => {
        const change = mover.change ?? 0;
        const previousClose = mover.price - change;
        return {
          Symbol: mover.ticker,
          LastTradedPrice: mover.price,
          Open: previousClose,
          High: Math.max(mover.price, previousClose),
          Low: Math.min(mover.price, previousClose),
          PrevClose: previousClose,
          Change: change,
          ChangePct: mover.change_pct ?? 0,
          Volume: mover.volume ?? 0,
          Currency: mover.currency ?? "KES",
          TradingStatus: "ACTIVE" as const,
          EventTimestamp: mover.last_updated,
        };
      });
  }

  fetchCandles(_symbol: string, _interval: NseRawCandle["Interval"], _from: string, _to: string) { return Promise.resolve<NseRawCandle[]>([]); }
  fetchCompanyProfile(_symbol: string) { return Promise.resolve<NseRawCompanyProfile | null>(null); }
  fetchFinancials(_symbol: string) { return Promise.resolve<NseRawFinancialPeriod[]>([]); }
  fetchCorporateActions(_symbol: string | null, _since: string) { return Promise.resolve<NseRawCorporateAction[]>([]); }
  fetchEarningsEvents(_symbol: string | null, _since: string) { return Promise.resolve<NseRawEarningsEvent[]>([]); }
  fetchOwnership(_symbol: string) { return Promise.resolve<NseRawOwnership[]>([]); }

  streamQuotes(_symbols: string[], _onTick: (q: NseRawQuote) => void): () => void {
    // TODO: open a WebSocket/FIX session to the licensed feed here and
    // call onTick() per message. Left unimplemented until that feed exists.
    throw new Error("RealNseClient.streamQuotes is not implemented yet — wire up the licensed feed's streaming endpoint here.");
  }
}

export function createNseClient(): INseClient {
  if (env.NSE_CLIENT_MODE === "afx") return new AfxClient();
  if (env.NSE_CLIENT_MODE === "mystocks") return new MyStocksClient();
  return env.NSE_CLIENT_MODE === "live" ? new RealNseClient() : new MockNseClient();
}