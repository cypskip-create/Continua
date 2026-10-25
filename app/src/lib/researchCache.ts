// Persist published company/market data only. Never persist portfolio,
// journal, auth tokens, paid workspaces or subscription decisions here.
export const RESEARCH_CACHE_KEY = 'continua:published-research:v1';
export const RESEARCH_MAX_AGE = 24 * 60 * 60_000;
const publicKinds = new Set(['indices', 'instruments', 'research', 'company',
  'financials-history', 'financials-latest', 'publisher-research', 'valuation', 'ownership',
  'corporate-actions', 'dividends', 'earnings', 'announcements', 'historical',
  'quotes', 'observed-price-history-v2', 'valuation-rating-v3', 'market-statistics', 'candles', 'indicator', 'screener', 'market-research', 'market-records', 'market-intelligence', 'market-earnings', 'market-screener']);
export function isPublishedQuery(key: readonly unknown[]) {
  return key[0] === 'continua' && publicKinds.has(String(key[1]));
}
export function freshCacheTime(updatedAt: unknown, now = Date.now(), maxAge = RESEARCH_MAX_AGE) {
  return typeof updatedAt === 'number' && updatedAt > 0 && updatedAt <= now && now - updatedAt < maxAge;
}
export function formatIndexChange(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  const rounded = Number(value.toFixed(2));
  return `${rounded >= 0 ? '+' : ''}${rounded.toFixed(2)}%`;
}
