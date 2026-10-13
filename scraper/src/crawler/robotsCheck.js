/**
 * Minimal robots.txt support (§20 — "respect robots.txt where
 * applicable"). This is intentionally simple: it only understands
 * User-agent/Disallow/Allow blocks for '*' and our own user agent, no
 * crawl-delay parsing (rate limiting is handled separately via source
 * config). Good enough to keep the crawler out of paths a site has
 * explicitly fenced off; not a full robots.txt spec implementation.
 */
import { safeFetch } from "./httpClient.js";
import { logger } from "../monitoring/logger.js";
import { env } from "../config/index.js";
const cache = new Map(); // null = no robots.txt / fetch failed → allow everything
function parseRobotsTxt(text, userAgent) {
    const lines = text.split("\n").map((l) => l.trim());
    const rules = { disallow: [], allow: [] };
    let currentGroupApplies = false;
    let sawSpecificAgent = false;
    const uaLower = userAgent.toLowerCase();
    // Two passes conceptually: first collect '*' rules, then override with
    // our specific agent's rules if present. To keep it simple, we do it in
    // one pass and just track whether the current block applies to us.
    for (const line of lines) {
        if (!line || line.startsWith("#"))
            continue;
        const [rawKey, ...rest] = line.split(":");
        if (!rawKey || rest.length === 0)
            continue;
        const key = rawKey.trim().toLowerCase();
        const value = rest.join(":").trim();
        if (key === "user-agent") {
            const agent = value.toLowerCase();
            if (agent === "*") {
                currentGroupApplies = !sawSpecificAgent;
            }
            else if (uaLower.includes(agent)) {
                currentGroupApplies = true;
                sawSpecificAgent = true;
            }
            else {
                currentGroupApplies = false;
            }
            continue;
        }
        if (!currentGroupApplies)
            continue;
        if (key === "disallow" && value)
            rules.disallow.push(value);
        if (key === "allow" && value)
            rules.allow.push(value);
    }
    return rules;
}
async function getRules(origin) {
    if (cache.has(origin))
        return cache.get(origin);
    try {
        const res = await safeFetch(`${origin}/robots.txt`, { timeoutMs: 10_000, maxBytes: 1024 * 1024 });
        if (res.status !== 200) {
            cache.set(origin, null);
            return null;
        }
        const rules = parseRobotsTxt(res.body.toString("utf-8"), env.CRAWLER_USER_AGENT);
        cache.set(origin, rules);
        return rules;
    }
    catch (err) {
        logger.debug({ origin, err }, "robots.txt fetch failed — allowing by default");
        cache.set(origin, null);
        return null;
    }
}
export async function isAllowedByRobots(url) {
    if (!env.RESPECT_ROBOTS_TXT)
        return true;
    const parsed = new URL(url);
    const origin = `${parsed.protocol}//${parsed.host}`;
    const rules = await getRules(origin);
    if (!rules)
        return true;
    const path = parsed.pathname + parsed.search;
    // Longest matching rule wins (standard robots.txt precedence).
    let bestMatch = { length: -1, allow: true };
    for (const d of rules.disallow) {
        if (d === "" || path.startsWith(d)) {
            if (d.length > bestMatch.length)
                bestMatch = { length: d.length, allow: false };
        }
    }
    for (const a of rules.allow) {
        if (path.startsWith(a)) {
            if (a.length > bestMatch.length)
                bestMatch = { length: a.length, allow: true };
        }
    }
    return bestMatch.allow;
}
