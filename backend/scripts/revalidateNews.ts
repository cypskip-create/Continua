/** Run on the backend host: npm run news:revalidate. No article is deleted. */
import { newsRepository } from "../src/storage/repositories/newsRepository.js";
import { pool } from "../src/storage/db.js";
async function main() {
  let cursor = "0", corrected = 0, processed = 0;
  do {
    const result = await newsRepository.revalidateBatch(cursor, 100);
    corrected += result.corrected; processed += result.processed;
    cursor = result.processed < 100 ? "0" : result.lastId;
  } while (cursor !== "0");
  console.log({ processed, corrected, methodology: "Issuer evidence v2; articles and publisher dates unchanged" });
}
main().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => pool.end());
