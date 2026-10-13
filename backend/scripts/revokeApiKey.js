/**
 * CLI: revoke an API key by its id (printed at creation time, or found via
 * `SELECT id, name FROM market.api_keys WHERE active = true`).
 *   npm run apikey:revoke -- <id>
 */
import { apiKeyRepository } from "../src/storage/repositories/apiKeyRepository.js";
import { pool } from "../src/storage/db.js";
async function main() {
    const id = process.argv[2];
    if (!id) {
        console.error("Usage: npm run apikey:revoke -- <id>");
        process.exit(1);
    }
    await apiKeyRepository.revoke(id);
    console.log(`Revoked API key ${id}. It will stop working within 30s (cache TTL) even on already-running API instances.`);
    await pool.end();
}
main().catch((err) => {
    console.error("Failed to revoke API key:", err);
    process.exit(1);
});
