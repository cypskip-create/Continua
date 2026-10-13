import type { DetectedFinancialTable } from '../../types/market.js';
import { HistoricalConfirmSchema } from '../confirmHistoricalColumns.js';
export declare const KAKUZI_GROUP_VERSION = "kakuzi-group-annual-v1";
/** Visually verified single-page group layout. Net-assets presentation needs
 * explicit gross reconstruction; cash is separate from other current assets. */
export declare function validateKakuziGroupReport(text: string, securityId: string): {
    table: DetectedFinancialTable;
    confirmation: ReturnType<typeof HistoricalConfirmSchema.parse>;
}[];
