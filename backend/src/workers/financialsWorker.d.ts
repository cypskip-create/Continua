/**
 * Daily sync of fundamentals (income statement, balance sheet, cash flow)
 * for every symbol on every registered exchange. Financials don't change
 * intraday, so this runs on a cron, not a poll loop — see FINANCIALS_SYNC_CRON.
 */
import { type ScheduledTask } from "node-cron";
export declare function runFinancialsSyncOnce(): Promise<void>;
export declare function startFinancialsWorker(): ScheduledTask;
