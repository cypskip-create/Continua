export declare class UnsafeUrlError extends Error {
}
/**
 * Resolves the hostname and rejects if the URL scheme isn't http(s), or
 * if any resolved address is a private/loopback/link-local IP. Throws
 * UnsafeUrlError rather than returning a boolean — callers should never
 * be able to accidentally ignore the result.
 */
export declare function assertPublicUrl(rawUrl: string): Promise<URL>;
