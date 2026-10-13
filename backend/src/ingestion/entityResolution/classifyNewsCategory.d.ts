/**
 * Best-effort keyword classification of a news article into one of the
 * app's Media-tab categories. Heuristic, same spirit as
 * resolveStockMentions.ts — no ML classifier behind this, just weighted
 * keyword hits, and ties/no-hits fall back to 'markets' as the honest
 * catch-all rather than guessing something more specific than the text
 * actually supports.
 */
export type NewsCategory = "markets" | "earnings" | "companies" | "economy" | "top";
export declare function classifyNewsCategory(text: string): NewsCategory;
