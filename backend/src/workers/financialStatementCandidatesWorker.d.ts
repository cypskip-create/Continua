/**
 * Periodically pulls whatever continua-scraper has detected as financial
 * tables into market.financial_statement_candidates for review. Runs
 * independently of the scraper itself, same pattern as
 * announcementsWorker.ts (including the same reasoning for why a one-off
 * run uses a dedicated always-runs script instead of self-detection).
 *
 * For a one-off manual run, use scripts/runFinancialCandidatesBridgeOnce.ts.
 */
import { type ScheduledTask } from "node-cron";
export declare function runFinancialCandidatesBridgeOnce(): Promise<void>;
export declare function startFinancialCandidatesWorker(): ScheduledTask;
