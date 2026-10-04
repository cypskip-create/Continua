/** Compare equal calendar-year windows, never an arbitrary number of payments. */
export function dividendWindows(payouts: { exDate: string | null; amountPerShare: number }[], now = new Date()) {
  const previous = new Date(now);
  previous.setUTCFullYear(previous.getUTCFullYear() - 1);
  const earlier = new Date(previous);
  earlier.setUTCFullYear(earlier.getUTCFullYear() - 1);
  const sum = (from: number, to: number) => payouts.filter((p) => {
    const t = p.exDate ? Date.parse(p.exDate) : NaN;
    return t > from && t <= to && Number.isFinite(p.amountPerShare) && p.amountPerShare >= 0;
  }).reduce((total, p) => total + p.amountPerShare, 0);
  const ttm = sum(previous.getTime(), now.getTime());
  const prior = sum(earlier.getTime(), previous.getTime());
  return { ttm, prior: prior > 0 ? prior : null, growth: prior > 0 ? (ttm - prior) / prior * 100 : null };
}
