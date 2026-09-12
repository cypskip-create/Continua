/**
 * Best-effort keyword classification of a news article into one of the
 * app's Media-tab categories. Heuristic, same spirit as
 * resolveStockMentions.ts — no ML classifier behind this, just weighted
 * keyword hits, and ties/no-hits fall back to 'markets' as the honest
 * catch-all rather than guessing something more specific than the text
 * actually supports.
 */
export type NewsCategory = "markets" | "earnings" | "companies" | "economy" | "top";

const CATEGORY_KEYWORDS: Record<Exclude<NewsCategory, "top">, string[]> = {
  markets: [],
  earnings: [
    "earnings", "profit", "net profit", "half-year results", "full-year results",
    "quarterly results", "dividend", "eps", "interim results", "annual results",
    "revenue rose", "revenue fell", "posts a profit", "posts a loss", "pre-tax profit",
  ],
  economy: [
    "central bank", "cbk", "inflation", "gdp", "interest rate", "monetary policy",
    "shilling", "treasury", "budget", "imf", "world bank", "public debt", "fiscal",
    "exchange rate", "forex", "trade deficit", "balance of payments",
  ],
  companies: [
    "appoints", "ceo", "board", "acquisition", "merger", "stake", "ipo", "listing",
    "rights issue", "shareholders", "restructuring", "partnership", "expansion",
  ],
};

export function classifyNewsCategory(text: string): NewsCategory {
  const lower = text.toLowerCase();
  let bestCategory: NewsCategory = "markets";
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as [Exclude<NewsCategory, "top">, string[]][]) {
    const score = keywords.reduce((count, kw) => (lower.includes(kw) ? count + 1 : count), 0);
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return bestCategory;
}