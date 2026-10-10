/** NSE research data. Coverage depends on the available sources; missing values remain unavailable. */
import type { Candle } from "../../types/market.js";

export type IndicatorSeries = (number | null)[];

export function sma(candles: Candle[], period: number): IndicatorSeries {
  const closes = candles.map((c) => c.close);
  return closes.map((_, i) => {
    if (i < period - 1) return null;
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += closes[j]!;
    return round(sum / period);
  });
}

export function ema(candles: Candle[], period: number): IndicatorSeries {
  const closes = candles.map((c) => c.close);
  const k = 2 / (period + 1);
  const out: IndicatorSeries = new Array(closes.length).fill(null);
  if (closes.length < period) return out;

  // Seed with a simple average of the first `period` closes (standard
  // convention — avoids the first EMA value being wildly sensitive to
  // whatever the very first close happened to be).
  let seed = 0;
  for (let i = 0; i < period; i++) seed += closes[i]!;
  out[period - 1] = round(seed / period);

  for (let i = period; i < closes.length; i++) {
    const prev = out[i - 1] as number;
    out[i] = round(closes[i]! * k + prev * (1 - k));
  }
  return out;
}

/** Wilder's RSI (the standard formulation — same one virtually every
 *  charting platform uses, including Moomoo's). 0-100, null until `period`
 *  candles of history exist. */
export function rsi(candles: Candle[], period = 14): IndicatorSeries {
  const closes = candles.map((c) => c.close);
  const out: IndicatorSeries = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const delta = closes[i]! - closes[i - 1]!;
    if (delta >= 0) gainSum += delta; else lossSum -= delta;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = computeRsiFromAverages(avgGain, avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const delta = closes[i]! - closes[i - 1]!;
    const gain = delta >= 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    // Wilder smoothing, not a simple rolling average.
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = computeRsiFromAverages(avgGain, avgLoss);
  }
  return out;
}

function computeRsiFromAverages(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return round(100 - 100 / (1 + rs));
}

export interface MacdResult {
  macd: IndicatorSeries;
  signal: IndicatorSeries;
  histogram: IndicatorSeries;
}

export function macd(candles: Candle[], fast = 12, slow = 26, signalPeriod = 9): MacdResult {
  const fastEma = ema(candles, fast);
  const slowEma = ema(candles, slow);
  const macdLine: IndicatorSeries = candles.map((_, i) => {
    const f = fastEma[i];
    const s = slowEma[i];
    return f != null && s != null ? round(f - s) : null;
  });

  // Signal line is an EMA of the MACD line itself — reuse ema() by
  // treating each non-null MACD value as a synthetic candle's close.
  const macdAsCandles = macdLine
    .map((v, i) => (v != null ? { close: v, timestamp: candles[i]!.timestamp } : null))
    .filter((c): c is { close: number; timestamp: string } => c !== null);
  const signalOnCompact = ema(
    macdAsCandles.map((c) => ({ ...c, securityId: "", interval: "1d" as const, open: c.close, high: c.close, low: c.close, volume: 0 })),
    signalPeriod
  );

  // Map the compact signal series back onto the original (possibly
  // null-padded) index space.
  const signal: IndicatorSeries = new Array(candles.length).fill(null);
  let compactIdx = 0;
  for (let i = 0; i < candles.length; i++) {
    if (macdLine[i] != null) {
      signal[i] = signalOnCompact[compactIdx] ?? null;
      compactIdx++;
    }
  }

  const histogram: IndicatorSeries = candles.map((_, i) => {
    const m = macdLine[i];
    const s = signal[i];
    return m != null && s != null ? round(m - s) : null;
  });

  return { macd: macdLine, signal, histogram };
}

/** Detects the most recent crossover in a fast/slow series pair (used by
 *  both indicator-alert evaluation and the backtester's sma_cross /
 *  ema_cross strategies). Returns null if the two most recent points don't
 *  form a fresh cross (i.e. the ordering didn't just flip). */
export function latestCrossover(fast: IndicatorSeries, slow: IndicatorSeries): "bullish" | "bearish" | null {
  const n = fast.length;
  if (n < 2) return null;
  const f0 = fast[n - 2], f1 = fast[n - 1], s0 = slow[n - 2], s1 = slow[n - 1];
  if (f0 == null || f1 == null || s0 == null || s1 == null) return null;
  if (f0 <= s0 && f1 > s1) return "bullish";
  if (f0 >= s0 && f1 < s1) return "bearish";
  return null;
}

const round = (n: number) => Math.round(n * 10_000) / 10_000;
