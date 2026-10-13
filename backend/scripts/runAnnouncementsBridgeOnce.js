/**
 * CLI: run the announcements bridge once and exit.
 *   npm run worker:announcements
 *
 * Unlike a cron-scheduled worker, this always runs when invoked — no
 * self-detection guard, which is what makes this reliable across
 * platforms (see announcementsWorker.ts's header comment for why that
 * approach was abandoned).
 */
import { runAnnouncementsBridgeOnce } from "../src/workers/announcementsWorker.js";
import { pool } from "../src/storage/db.js";
async function main() {
    await runAnnouncementsBridgeOnce();
    await pool.end();
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
