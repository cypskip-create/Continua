/**
 * CLI: run the financial statement candidates bridge once and exit.
 *   npm run worker:financial-candidates
 *
 * Always runs when invoked — no self-detection guard, same reasoning as
 * runAnnouncementsBridgeOnce.ts.
 */
import { runFinancialCandidatesBridgeOnce } from "../src/workers/financialStatementCandidatesWorker.js";
import { pool } from "../src/storage/db.js";
async function main() {
    await runFinancialCandidatesBridgeOnce();
    await pool.end();
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
