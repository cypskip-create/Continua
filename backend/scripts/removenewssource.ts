/**
 * CLI: disable a scraped source AND remove everything it already put into
 * market.news_items — the two-part fix "gone completely" needs. Disabling
 * scraping.sources alone (which is all sourcesRepository.upsertSource on
 * the scraper side does) only stops FUTURE crawls; whatever it already
 * ingested stays in market.news_items and keeps showing in the app until
 * something also deletes those rows. This script does both, in one
 * transaction, matched by a case-insensitive substring of the source's
 * name (safer than requiring you to already know its exact id).
 *
 *   npm run source:remove -- "Hacker News"
 *
 * Prints what it's about to touch before it touches it. If more than one
 * source matches the search text, it lists them and does nothing — rerun
 * with a more specific string.
 */
import { pool } from "../src/storage/db.js";

async function main() {
  const searchText = process.argv[2];
  if (!searchText) {
    console.error('Usage: npm run source:remove -- "<part of the source name>"');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    const matches = await client.query<{ id: string; name: string; enabled: boolean }>(
      `SELECT id, name, enabled FROM scraping.sources WHERE name ILIKE $1`,
      [`%${searchText}%`],
    );

    if (matches.rows.length === 0) {
      console.log(`No source found matching "${searchText}".`);
      return;
    }
    if (matches.rows.length > 1) {
      console.log(`${matches.rows.length} sources match "${searchText}" — be more specific:`);
      matches.rows.forEach((r) => console.log(`  ${r.id}  (${r.name})`));
      return;
    }

    const source = matches.rows[0];
    console.log(`Removing source '${source.id}' (${source.name})...`);

    await client.query("BEGIN");
    const deleted = await client.query(`DELETE FROM market.news_items WHERE source = $1`, [source.id]);
    await client.query(`UPDATE scraping.sources SET enabled = false, updated_at = now() WHERE id = $1`, [source.id]);
    await client.query("COMMIT");

    console.log(`Deleted ${deleted.rowCount} existing news item(s) and disabled the source.`);
    console.log("It will no longer be crawled and its old articles are gone from the app.");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => pool.end());