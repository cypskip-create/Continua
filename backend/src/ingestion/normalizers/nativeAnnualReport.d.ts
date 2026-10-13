import type { DetectedFinancialTable } from '../../types/market.js';
import { HistoricalConfirmSchema } from '../confirmHistoricalColumns.js';
export declare const NATIVE_ANNUAL_VERSION = "consolidated-native-annual-v1";
/** A deliberately narrow native layout, not an OCR-confidence shortcut.
 * Explicit consolidated scope, dated annual heading, one aligned year header,
 * KES units, source approval date and accounting cross-checks are mandatory.
 * Company-only/group-bank mixed columns, notes columns without headers,
 * interim periods and duplicate labels fail closed into the review queue.
 */
export declare function validateNativeAnnualReport(text: string, issuer: string, securityId: string): {
    table: DetectedFinancialTable;
    confirmation: ReturnType<typeof HistoricalConfirmSchema.parse>;
}[];
