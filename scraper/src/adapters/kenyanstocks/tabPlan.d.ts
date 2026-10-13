import type { SourceDocument } from '../types.js';
export declare const STOCK_TABS: string[];
export declare const FINANCIAL_CATEGORIES: string[];
/** Job identity includes category; each view is independently resumable. */
export declare function stockTabDocuments(stockUrl: string, tabs?: string[], categories?: string[]): SourceDocument[];
