import type { Quote } from "../../types/market.js";
import type { ExchangeCode } from "../../config/index.js";
export declare const quoteService: {
    getQuote(exchange: ExchangeCode, symbol: string): Promise<Quote | null>;
    getQuotesBatch(exchange: ExchangeCode, symbols: string[]): Promise<Quote[]>;
};
