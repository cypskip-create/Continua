import { query } from "../../storage/db.js";
import { analyzeNewsIssuers } from "../../services/research/newsRelevance.js";
let directoryCache = null;
export async function loadNewsIssuerDirectory(exchange) {
    if (directoryCache?.exchange === exchange && Date.now() - directoryCache.loadedAt < 300_000)
        return directoryCache.entries;
    const res = await query(`SELECT s.id as "securityId", s.symbol, c.name as "companyName"
    FROM market.securities s JOIN market.companies c ON c.id=s.company_id WHERE s.exchange=$1`, [exchange]);
    directoryCache = { exchange, entries: res.rows, loadedAt: Date.now() };
    return res.rows;
}
export function clearStockMentionDirectoryCache() { directoryCache = null; }
export async function resolveStockMentions(headline, articleText, exchange) {
    return analyzeNewsIssuers(headline, articleText, await loadNewsIssuerDirectory(exchange)).map(m => m.securityId);
}
