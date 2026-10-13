import { type ValuationRatio } from './valuationHistory.js';
import type { ExchangeCode } from '../../config/index.js';
export declare function valuationHistory(exchange: ExchangeCode, symbol: string, ratio: ValuationRatio, years: number): Promise<{
    symbol: string;
    ratio: ValuationRatio;
    current: {
        ratio: number | null;
        price: number;
        fiscalYear: number | null;
        reportedAt: string | null;
        denominator: number | null;
        sourceUrls: string[];
        date: string;
        time: number;
    } | null;
    points: {
        ratio: number | null;
        price: number;
        fiscalYear: number | null;
        reportedAt: string | null;
        denominator: number | null;
        sourceUrls: string[];
        date: string;
        time: number;
    }[];
    lastHistoricalDate: string | null;
    basis: string;
}>;
