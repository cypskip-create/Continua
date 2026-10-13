import type { DetectedFinancialTable } from '../../types/market.js';
import { HistoricalConfirmSchema } from '../confirmHistoricalColumns.js';
export declare const CONDENSED_GROUP_VERSION = "safaricom-condensed-group-v1";
/** Verified one-page Safaricom audited layout. Group columns precede company
 * columns; never mix the two. Both dated comparative columns are retained.
 * This is a template validator, not permission to publish arbitrary OCR. */
export declare function validateCondensedGroupReport(text: string, issuer: string, securityId: string): {
    table: DetectedFinancialTable;
    confirmation: ReturnType<typeof HistoricalConfirmSchema.parse>;
}[];
