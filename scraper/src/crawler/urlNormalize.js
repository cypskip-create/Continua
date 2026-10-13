/**
 * Produces a canonical form of a URL so that http://Example.com/a,
 * https://example.com/a/, and https://example.com/a#section are
 * recognized as the same page for dedup purposes (§17). Deliberately
 * conservative — it does NOT reorder query params or strip tracking
 * params, since for financial sources a query param can be meaningful
 * (?symbol=SCOM). It only normalizes things that are unambiguous.
 */
export function canonicalizeUrl(rawUrl) {
    const url = new URL(rawUrl);
    url.hostname = url.hostname.toLowerCase();
    url.hash = "";
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
        url.pathname = url.pathname.slice(0, -1);
    }
    // Default ports are redundant.
    if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) {
        url.port = "";
    }
    return url.toString();
}
export function resolveUrl(base, href) {
    try {
        return new URL(href, base).toString();
    }
    catch {
        return null;
    }
}
export function isSameOrSubdomain(hostname, allowedDomains) {
    const host = hostname.toLowerCase();
    return allowedDomains.some((domain) => {
        const d = domain.toLowerCase();
        return host === d || host.endsWith(`.${d}`);
    });
}
