export function alignedReturns(
  series: { symbol: string; candles: { timestamp: string; close: number }[] }[],
) {
  const maps = series.map(
    (s) =>
      new Map(
        s.candles
          .filter((c) => c.close > 0 && Number.isFinite(c.close))
          .map((c) => [c.timestamp.slice(0, 10), c.close]),
      ),
  );
  if (!maps.length) return [];
  const dates = [...maps[0].keys()]
    .filter((date) => maps.every((m) => m.has(date)))
    .sort();
  return dates.map((date) =>
    Object.fromEntries([
      ["date", date],
      ...series.map((s, i) => [
        s.symbol,
        (maps[i].get(date)! / maps[i].get(dates[0])!) * 100,
      ]),
    ]),
  ) as { date: string; [key: string]: string | number }[];
}
export function correlation(a: number[], b: number[]) {
  if (a.length !== b.length || a.length < 3) return null;
  const ma = a.reduce((s, v) => s + v, 0) / a.length,
    mb = b.reduce((s, v) => s + v, 0) / b.length;
  const va = a.reduce((s, v) => s + (v - ma) ** 2, 0),
    vb = b.reduce((s, v) => s + (v - mb) ** 2, 0);
  if (!va || !vb) return null;
  return (
    a.reduce((s, v, i) => s + (v - ma) * (b[i] - mb), 0) / Math.sqrt(va * vb)
  );
}
/** Transparent drift scenario; not a price target or calibrated confidence interval. */
export function trendScenario(values: number[], steps = 5) {
  if (values.length < 20 || values.some((v) => !Number.isFinite(v) || v <= 0))
    return [];
  const returns = values.slice(1).map((v, i) => Math.log(v / values[i]));
  const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
  const volatility = Math.sqrt(
    returns.reduce((s, v) => s + (v - mean) ** 2, 0) / (returns.length - 1),
  );
  return Array.from({ length: steps }, (_, i) => {
    const n = i + 1,
      center = values.at(-1)! * Math.exp(mean * n),
      spread = volatility * Math.sqrt(n);
    return {
      center,
      lower: center * Math.exp(-spread),
      upper: center * Math.exp(spread),
    };
  });
}
