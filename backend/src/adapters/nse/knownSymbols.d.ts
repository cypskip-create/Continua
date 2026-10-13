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
export declare const KNOWN_NSE_SYMBOLS: string[];
