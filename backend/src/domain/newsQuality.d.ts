import type { NewsItem } from "../types/market.js";
export { isFinancialNews } from "./financialNews.js";
export declare function normalizeNewsHeadline(value: string): string;
export declare function canonicalNewsUrl(value: string): string;
export declare function cleanArticleContent(headline: string, value: string | null | undefined): string | null;
/** Prefer one verified receipt; never union old tags into its evidence. */
export declare function dedupeNewsItems(items: NewsItem[]): NewsItem[];
