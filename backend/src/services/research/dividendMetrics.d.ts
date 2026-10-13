import type { CorporateAction } from '../../types/market.js';
/** Trailing twelve months means a date window, not the last four payments
 * (which can span years for annual/semiannual NSE dividends). */
export declare function trailingDividendPerShare(actions: CorporateAction[], now?: Date): number | undefined;
