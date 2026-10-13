/**
 * Produces a canonical form of a URL so that http://Example.com/a,
 * https://example.com/a/, and https://example.com/a#section are
 * recognized as the same page for dedup purposes (§17). Deliberately
 * conservative — it does NOT reorder query params or strip tracking
 * params, since for financial sources a query param can be meaningful
 * (?symbol=SCOM). It only normalizes things that are unambiguous.
 */
export declare function canonicalizeUrl(rawUrl: string): string;
export declare function resolveUrl(base: string, href: string): string | null;
export declare function isSameOrSubdomain(hostname: string, allowedDomains: string[]): boolean;
