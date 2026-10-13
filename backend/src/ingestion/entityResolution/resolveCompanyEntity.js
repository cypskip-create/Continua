/**
 * Matches a raw company name string as it appeared in a scraped source
 * (e.g. "Car & General Kenya Plc" from an NSE announcement title) against
 * known companies in market.companies.
 *
 * Deliberately conservative per the scraper spec's §12: "do not blindly
 * infer ticker symbols... mark it as unresolved and let the entity-
 * resolution layer handle it." This IS that layer, and it still refuses
 * to guess — an ambiguous or low-confidence match returns null rather
 * than picking the closest one. A wrong company match on a financial
 * announcement is worse than an unresolved one; the former silently
 * corrupts data, the latter is visibly flagged for a human to fix.
 */
import { query } from "../../storage/db.js";
const COMPANY_SUFFIX_WORDS = new Set([
    "plc", "ltd", "limited", "group", "kenya", "holdings", "co", "company", "incorporated", "inc",
]);
function normalize(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length > 0 && !COMPANY_SUFFIX_WORDS.has(word))
        .join(" ")
        .trim();
}
/**
 * Attempts to resolve a raw source-provided company name against
 * market.companies. Returns null (unresolved) unless there is exactly
 * one candidate after normalization — multiple partial matches are
 * treated as ambiguous, not resolved to "the best guess".
 */
export async function resolveCompanyEntity(rawName, exchange) {
    const normalized = normalize(rawName);
    if (!normalized)
        return null;
    const res = await query(`SELECT c.id as "companyId", c.name, s.id as "securityId"
     FROM market.companies c
     JOIN market.securities s ON s.company_id = c.id AND s.exchange = $1`, [exchange]);
    const candidates = res.rows.filter((row) => {
        const candidateNormalized = normalize(row.name);
        return candidateNormalized === normalized || candidateNormalized.includes(normalized) || normalized.includes(candidateNormalized);
    });
    // Exact normalized match, if present, always wins even when a looser
    // substring match also matched something else.
    const exact = candidates.filter((c) => normalize(c.name) === normalized);
    if (exact.length === 1)
        return { companyId: exact[0].companyId, securityId: exact[0].securityId };
    if (candidates.length === 1) {
        return { companyId: candidates[0].companyId, securityId: candidates[0].securityId };
    }
    // Zero or multiple (ambiguous) candidates — unresolved, not guessed.
    return null;
}
