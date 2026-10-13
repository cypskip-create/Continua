import crypto from "node:crypto";
import { query } from "../db.js";
// Deterministic KDF parameters for API-key lookup hashes.
// NOTE: Changing these values invalidates previously stored key_hash values.
const API_KEY_HASH_SALT = "market.api_keys.v1";
const API_KEY_HASH_KEYLEN = 32;
const API_KEY_HASH_PARAMS = { N: 1 << 14, r: 8, p: 1 };
export function hashApiKey(plaintextKey) {
    return crypto
        .scryptSync(plaintextKey, API_KEY_HASH_SALT, API_KEY_HASH_KEYLEN, API_KEY_HASH_PARAMS)
        .toString("hex");
}
/** Same stored hash, but never block HTTP/health probes with synchronous KDF work. */
export function hashApiKeyAsync(plaintextKey) {
    return new Promise((resolve, reject) => {
        crypto.scrypt(plaintextKey, API_KEY_HASH_SALT, API_KEY_HASH_KEYLEN, API_KEY_HASH_PARAMS, (error, key) => error ? reject(error) : resolve(key.toString("hex")));
    });
}
export const apiKeyRepository = {
    /** Looks up an active key by its hash. Called on (almost) every request,
     *  so callers should wrap this with a short-TTL cache — see
     *  api/middleware/apiKeyAuth.ts. */
    async findActiveByHash(keyHash) {
        const res = await query(`SELECT id, name, active, rate_limit_per_min as "rateLimitPerMin"
       FROM market.api_keys WHERE key_hash = $1 AND active = true`, [keyHash]);
        return res.rows[0] ?? null;
    },
    async touchLastUsed(id) {
        await query(`UPDATE market.api_keys SET last_used_at = now() WHERE id = $1`, [id]);
    },
    /** Creates a new key and returns the ONE-TIME plaintext value — only the
     *  hash is ever persisted. See scripts/generateApiKey.ts for the CLI. */
    async create(name, rateLimitPerMin = 120) {
        const plaintextKey = `afk_${crypto.randomBytes(24).toString("hex")}`;
        const keyHash = hashApiKey(plaintextKey);
        const res = await query(`INSERT INTO market.api_keys (key_hash, name, rate_limit_per_min) VALUES ($1, $2, $3) RETURNING id`, [keyHash, name, rateLimitPerMin]);
        return { id: res.rows[0].id, plaintextKey };
    },
    async revoke(id) {
        await query(`UPDATE market.api_keys SET active = false WHERE id = $1`, [id]);
    },
};
