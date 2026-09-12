/**
 * CLI: run the news bridge once and exit.
 *   npm run worker:news
 *
 * Unlike a cron-scheduled worker, this always runs when invoked — no
 * self-detection guard, same reasoning as runAnnouncementsBridgeOnce.ts.
 */
import { runNewsBridgeOnce } from "../src/workers/newsWorker.js";
import { pool } from "../src/storage/db.js";

async function main() {
  await runNewsBridgeOnce();
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});