/** Scope issuer crawls to archives and filings, not product/marketing navigation. */
export function matchesDiscoveryPaths(url, patterns) {
    if (!patterns?.length)
        return true;
    try {
        const path = new URL(url).pathname.toLowerCase();
        return patterns.some((fragment) => path.includes(fragment.toLowerCase()));
    }
    catch {
        return false;
    }
}
