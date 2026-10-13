export interface ApiKeyRecord {
    id: string;
    name: string;
    active: boolean;
    rateLimitPerMin: number;
}
export declare function hashApiKey(plaintextKey: string): string;
/** Same stored hash, but never block HTTP/health probes with synchronous KDF work. */
export declare function hashApiKeyAsync(plaintextKey: string): Promise<string>;
export declare const apiKeyRepository: {
    /** Looks up an active key by its hash. Called on (almost) every request,
     *  so callers should wrap this with a short-TTL cache — see
     *  api/middleware/apiKeyAuth.ts. */
    findActiveByHash(keyHash: string): Promise<ApiKeyRecord | null>;
    touchLastUsed(id: string): Promise<void>;
    /** Creates a new key and returns the ONE-TIME plaintext value — only the
     *  hash is ever persisted. See scripts/generateApiKey.ts for the CLI. */
    create(name: string, rateLimitPerMin?: number): Promise<{
        id: string;
        plaintextKey: string;
    }>;
    revoke(id: string): Promise<void>;
};
