/**
 * CLI: create a new API key.
 *   npm run apikey:create -- "Some Customer Name" [rateLimitPerMin]
 *
 * Prints the plaintext key exactly once — only its hash is stored. If it's
 * lost, revoke it (scripts/revokeApiKey.ts) and issue a new one; there is
 * no way to recover the plaintext from the database by design.
 */
import { apiKeyRepository } from "../src/storage/repositories/apiKeyRepository.js";
import { pool } from "../src/storage/db.js";
async function main() {
    const name = process.argv[2];
    const rateLimit = process.argv[3] ? Number(process.argv[3]) : 120;
    if (!name) {
        console.error('Usage: npm run apikey:create -- "Customer Name" [rateLimitPerMin]');
        process.exit(1);
    }
    const { id, plaintextKey } = await apiKeyRepository.create(name, rateLimit);
    console.log("API key created — save this now, it will not be shown again:\n");
    console.log(`  id:            ${id}`);
    console.log(`  name:          ${name}`);
    console.log(`  rateLimit:     ${rateLimit}/min`);
    console.log(`  key:           ${plaintextKey}\n`);
    console.log("Use it as: Authorization: Bearer " + plaintextKey);
    await pool.end();
}
main().catch((err) => {
    console.error("Failed to create API key:", err);
    process.exit(1);
});
