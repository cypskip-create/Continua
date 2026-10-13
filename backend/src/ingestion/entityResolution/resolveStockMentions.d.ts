import { type NewsIssuer } from "../../services/research/newsRelevance.js";
export declare function loadNewsIssuerDirectory(exchange: string): Promise<NewsIssuer[]>;
export declare function clearStockMentionDirectoryCache(): void;
export declare function resolveStockMentions(headline: string, articleText: string, exchange: string): Promise<string[]>;
