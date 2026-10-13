import { HistoricalConfirmSchema } from '../confirmHistoricalColumns.js';
import type { DetectedFinancialTable } from '../../types/market.js';
export declare const SAFARICOM_PRESS_VERSION = "safaricom-native-bn-comparatives-v1";
/** Verified legacy issuer results layout. EPS and unreported balance totals
 * remain unknown. First observed date is conservative availability, NOT an
 * invented original release date. No historical backtest gets early access. */
export declare function validateSafaricomPressReport(text: string, observedAt: string): {
    table: DetectedFinancialTable;
    confirmation: ReturnType<typeof HistoricalConfirmSchema.parse>;
}[];
