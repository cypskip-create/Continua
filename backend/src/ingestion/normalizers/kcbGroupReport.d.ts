import type { DetectedFinancialTable } from '../../types/market.js';
import { HistoricalConfirmSchema } from '../confirmHistoricalColumns.js';
export declare const KCB_GROUP_VERSION = "kcb-six-column-group-2017-v1";
export declare function validateKcbGroupReport(text: string, securityId: string): {
    table: DetectedFinancialTable;
    confirmation: ReturnType<typeof HistoricalConfirmSchema.parse>;
}[];
