/** Only daily observations covering the requested window may form a chart. */
export function hasHomeHistoryCoverage(points, period, now = Date.now()) {
  const days = { '1W': 7, '1M': 30, '3M': 90, '1Y': 365 };
  if (period === '1D' || points.length < 2 || points.some(p => !Number.isFinite(p.value) || p.value < 0 || !Number.isFinite(p.timestamp) || p.timestamp > now)) return false;
  if (period === 'ALL') return true;
  const span = days[period];
  if (!span || points.length < Math.min(10, Math.ceil(span * .45))) return false;
  return points[0].timestamp <= now - Math.max(1, span - 5) * 86400000 && points.at(-1).timestamp >= now - 7 * 86400000;
}
