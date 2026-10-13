/**
 * Blocks the crawler from ever fetching an internal/private network
 * address, regardless of what a source's seeds or a page's links point
 * at (§28 — "never allow arbitrary scraped URLs to access internal/
 * private network addresses"). Every fetch in this service must go
 * through assertPublicUrl first.
 */
import dns from "node:dns/promises";
import net from "node:net";
export class UnsafeUrlError extends Error {
}
function isPrivateIPv4(ip) {
    const parts = ip.split(".").map(Number);
    const a = parts[0], b = parts[1];
    if (a === 10)
        return true; // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31)
        return true; // 172.16.0.0/12
    if (a === 192 && b === 168)
        return true; // 192.168.0.0/16
    if (a === 127)
        return true; // loopback
    if (a === 169 && b === 254)
        return true; // link-local (incl. cloud metadata 169.254.169.254)
    if (a === 0)
        return true; // "this network"
    return false;
}
function isPrivateIPv6(ip) {
    const lower = ip.toLowerCase();
    if (lower === "::1")
        return true; // loopback
    if (lower.startsWith("fc") || lower.startsWith("fd"))
        return true; // fc00::/7 unique local
    if (lower.startsWith("fe80"))
        return true; // link-local
    return false;
}
/**
 * Resolves the hostname and rejects if the URL scheme isn't http(s), or
 * if any resolved address is a private/loopback/link-local IP. Throws
 * UnsafeUrlError rather than returning a boolean — callers should never
 * be able to accidentally ignore the result.
 */
export async function assertPublicUrl(rawUrl) {
    let url;
    try {
        url = new URL(rawUrl);
    }
    catch {
        throw new UnsafeUrlError(`Not a valid URL: ${rawUrl}`);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new UnsafeUrlError(`Unsupported protocol: ${url.protocol}`);
    }
    const hostname = url.hostname;
    // Literal IP in the URL — check directly without a DNS round trip.
    if (net.isIP(hostname)) {
        const unsafe = net.isIPv4(hostname) ? isPrivateIPv4(hostname) : isPrivateIPv6(hostname);
        if (unsafe)
            throw new UnsafeUrlError(`Refusing to fetch private address: ${hostname}`);
        return url;
    }
    let records;
    try {
        records = await dns.lookup(hostname, { all: true });
    }
    catch (err) {
        throw new UnsafeUrlError(`DNS resolution failed for ${hostname}: ${err.message}`);
    }
    for (const rec of records) {
        const unsafe = rec.family === 4 ? isPrivateIPv4(rec.address) : isPrivateIPv6(rec.address);
        if (unsafe) {
            throw new UnsafeUrlError(`Refusing to fetch ${hostname} — resolves to private address ${rec.address}`);
        }
    }
    return url;
}
