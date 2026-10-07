// Pure, dependency-free technical indicator math for the stock chart.
// Each function takes the same point shape the chart already uses
// (verified useHistoricalCandles output) and
// returns one value per input point (null where there isn't enough
// history yet to compute one).

export interface IndicatorPoint {
  price: number;
  close?: number;
  high?: number;
  low?: number;
  date?: string;
  volume?: number;
}

/** Which indicators are currently switched on for a chart — overlays draw on the
 *  price chart itself, subPanel is a single secondary oscillator panel below it
 *  (Moomoo lets several oscillators be open in tabs; we keep one at a time to
 *  keep the chart readable on a phone screen). Volume is independent of both —
 *  like Moomoo, it's its own compact panel that can be shown alongside an
 *  oscillator, not exclusive with it. */
export interface IndicatorSettings {
  overlays: { ma: boolean; ema: boolean; boll: boolean; sar: boolean };
  volume: boolean;
  subPanel: "none" | "macd" | "rsi" | "kdj" | "wr" | "cci";
}

export const DEFAULT_INDICATOR_SETTINGS: IndicatorSettings = {
  overlays: { ma: false, ema: false, boll: false, sar: false },
  // On by default, Moomoo-style — every other overlay/oscillator is opt-in,
  // but the volume strip is something people expect to just be there.
  volume: true,
  subPanel: "none",
};

export const ALL_INDICATORS_OFF: IndicatorSettings = DEFAULT_INDICATOR_SETTINGS;

export function anyIndicatorsOn(settings: IndicatorSettings): boolean {
  return settings.overlays.ma || settings.overlays.ema || settings.overlays.boll || settings.overlays.sar || settings.volume || settings.subPanel !== "none";
}

/** Indicator choices are a chart preference, not a per-stock one — Moomoo and every
 *  other charting app keep MA/RSI/etc. switched on as you move between symbols until
 *  you turn them off yourself. Persisted to localStorage so it also survives a reload. */
const INDICATOR_STORAGE_KEY = "continua:chart-indicators";

function isValidIndicatorSettings(value: unknown): value is IndicatorSettings {
  if (!value || typeof value !== "object") return false;
  const v = value as { overlays?: Partial<Record<string, unknown>>; subPanel?: unknown };
  return (
    !!v.overlays &&
    typeof v.overlays.ma === "boolean" &&
    typeof v.overlays.ema === "boolean" &&
    typeof v.overlays.boll === "boolean" &&
    typeof v.subPanel === "string"
  );
}

export function loadIndicatorSettings(): IndicatorSettings {
  if (typeof window === "undefined") return DEFAULT_INDICATOR_SETTINGS;
  try {
    const raw = window.localStorage.getItem(INDICATOR_STORAGE_KEY);
    if (!raw) return DEFAULT_INDICATOR_SETTINGS;
    const parsed = JSON.parse(raw);
    if (!isValidIndicatorSettings(parsed)) return DEFAULT_INDICATOR_SETTINGS;
    // Merge over the default so older saved settings missing newer keys (e.g. `sar`,
    // `volume`, added later) still come back with well-defined values instead of undefined.
    return {
      overlays: { ...DEFAULT_INDICATOR_SETTINGS.overlays, ...parsed.overlays },
      volume: typeof (parsed as any).volume === "boolean" ? (parsed as any).volume : false,
      subPanel: parsed.subPanel ?? "none",
    };
  } catch {
    return DEFAULT_INDICATOR_SETTINGS;
  }
}

export function saveIndicatorSettings(settings: IndicatorSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(INDICATOR_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage can fail (private browsing, quota) — indicator persistence is a nice-to-have, not critical.
  }
}

const closeOf = (d: IndicatorPoint) => d.close ?? d.price;
const highOf = (d: IndicatorPoint) => d.high ?? closeOf(d);
const lowOf = (d: IndicatorPoint) => d.low ?? closeOf(d);

/** Simple moving average. */
export function sma(data: IndicatorPoint[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(data.length).fill(null);
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += closeOf(data[i]);
    if (i >= period) sum -= closeOf(data[i - period]);
    if (i >= period - 1) out[i] = +(sum / period).toFixed(4);
  }
  return out;
}

/** Exponential moving average, seeded with the SMA of the first `period` points. */
export function ema(data: IndicatorPoint[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(data.length).fill(null);
  if (data.length < period) return out;
  const k = 2 / (period + 1);
  let seedSum = 0;
  for (let i = 0; i < period; i++) seedSum += closeOf(data[i]);
  let prev = seedSum / period;
  out[period - 1] = +prev.toFixed(4);
  for (let i = period; i < data.length; i++) {
    prev = closeOf(data[i]) * k + prev * (1 - k);
    out[i] = +prev.toFixed(4);
  }
  return out;
}

/** Bollinger Bands: SMA midline ± (stdDevMultiplier × rolling standard deviation). */
export function bollingerBands(data: IndicatorPoint[], period = 20, stdDevMultiplier = 2) {
  const mid = sma(data, period);
  return data.map((_, i) => {
    const m = mid[i];
    if (m == null) return { upper: null as number | null, mid: null as number | null, lower: null as number | null };
    const slice = data.slice(i - period + 1, i + 1);
    const variance = slice.reduce((s, d) => s + (closeOf(d) - m) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    return { upper: +(m + stdDevMultiplier * sd).toFixed(4), mid: m, lower: +(m - stdDevMultiplier * sd).toFixed(4) };
  });
}

/** Relative Strength Index (Wilder's smoothing). */
export function rsi(data: IndicatorPoint[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(data.length).fill(null);
  if (data.length <= period) return out;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closeOf(data[i]) - closeOf(data[i - 1]);
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  out[period] = avgLoss === 0 ? 100 : +(100 - 100 / (1 + avgGain / avgLoss)).toFixed(2);
  for (let i = period + 1; i < data.length; i++) {
    const diff = closeOf(data[i]) - closeOf(data[i - 1]);
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : +(100 - 100 / (1 + avgGain / avgLoss)).toFixed(2);
  }
  return out;
}

/** MACD line (EMA-fast − EMA-slow), its signal line (EMA of the MACD line), and histogram. */
export function macd(data: IndicatorPoint[], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const emaFast = ema(data, fastPeriod);
  const emaSlow = ema(data, slowPeriod);
  const macdLine: (number | null)[] = data.map((_, i) =>
    emaFast[i] != null && emaSlow[i] != null ? +((emaFast[i] as number) - (emaSlow[i] as number)).toFixed(4) : null
  );

  // Signal = EMA of the MACD line, computed only over the indices where MACD exists
  // (feeding the null-prefix in would corrupt the EMA seed).
  const validIndices: number[] = [];
  const validPoints: IndicatorPoint[] = [];
  macdLine.forEach((v, i) => {
    if (v != null) { validIndices.push(i); validPoints.push({ price: v }); }
  });
  const signalValid = ema(validPoints, signalPeriod);
  const signal: (number | null)[] = new Array(data.length).fill(null);
  signalValid.forEach((v, idx) => { if (v != null) signal[validIndices[idx]] = v; });

  const histogram: (number | null)[] = macdLine.map((v, i) =>
    v != null && signal[i] != null ? +(v - (signal[i] as number)).toFixed(4) : null
  );

  return { macdLine, signal, histogram };
}

/** Parabolic SAR (Wilder) — dot-per-point overlay marking a trailing stop-and-reverse
 *  level, flipping above/below price as the trend flips. Accelerates toward price the
 *  longer a trend continues, capped at `maxStep`. */
export function parabolicSAR(data: IndicatorPoint[], step = 0.02, maxStep = 0.2): (number | null)[] {
  const out: (number | null)[] = new Array(data.length).fill(null);
  if (data.length < 2) return out;

  let isUp = closeOf(data[1]) >= closeOf(data[0]);
  let af = step;
  let ep = isUp ? highOf(data[0]) : lowOf(data[0]);
  let sar = isUp ? lowOf(data[0]) : highOf(data[0]);
  out[0] = +sar.toFixed(4);

  for (let i = 1; i < data.length; i++) {
    const high = highOf(data[i]);
    const low = lowOf(data[i]);
    sar = sar + af * (ep - sar);

    if (isUp) {
      sar = Math.min(sar, lowOf(data[i - 1]), i > 1 ? lowOf(data[i - 2]) : lowOf(data[i - 1]));
      if (low < sar) {
        isUp = false;
        sar = ep;
        ep = low;
        af = step;
      } else {
        if (high > ep) { ep = high; af = Math.min(af + step, maxStep); }
      }
    } else {
      sar = Math.max(sar, highOf(data[i - 1]), i > 1 ? highOf(data[i - 2]) : highOf(data[i - 1]));
      if (high > sar) {
        isUp = true;
        sar = ep;
        ep = high;
        af = step;
      } else {
        if (low < ep) { ep = low; af = Math.min(af + step, maxStep); }
      }
    }
    out[i] = +sar.toFixed(4);
  }
  return out;
}

/** KDJ (Stochastic Oscillator + J line) — the version Moomoo shows by default,
 *  smoothed with the classic 1/3 · current + 2/3 · previous recursion. */
export function kdj(data: IndicatorPoint[], period = 9, kSmooth = 3, dSmooth = 3) {
  const k: (number | null)[] = new Array(data.length).fill(null);
  const d: (number | null)[] = new Array(data.length).fill(null);
  const j: (number | null)[] = new Array(data.length).fill(null);
  let prevK = 50, prevD = 50;

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) continue;
    const slice = data.slice(i - period + 1, i + 1);
    const highest = Math.max(...slice.map(highOf));
    const lowest = Math.min(...slice.map(lowOf));
    const rsv = highest === lowest ? 50 : ((closeOf(data[i]) - lowest) / (highest - lowest)) * 100;
    const kVal = (1 / kSmooth) * rsv + (1 - 1 / kSmooth) * prevK;
    const dVal = (1 / dSmooth) * kVal + (1 - 1 / dSmooth) * prevD;
    const jVal = 3 * kVal - 2 * dVal;
    k[i] = +kVal.toFixed(2);
    d[i] = +dVal.toFixed(2);
    j[i] = +jVal.toFixed(2);
    prevK = kVal;
    prevD = dVal;
  }
  return { k, d, j };
}

/** Williams %R — momentum oscillator, 0 (overbought) to -100 (oversold). */
export function williamsR(data: IndicatorPoint[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(data.length).fill(null);
  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    const highest = Math.max(...slice.map(highOf));
    const lowest = Math.min(...slice.map(lowOf));
    out[i] = highest === lowest ? 0 : +(((highest - closeOf(data[i])) / (highest - lowest)) * -100).toFixed(2);
  }
  return out;
}

/** Commodity Channel Index — measures deviation from the average typical price. */
export function cci(data: IndicatorPoint[], period = 20): (number | null)[] {
  const out: (number | null)[] = new Array(data.length).fill(null);
  const typical = data.map(d => (highOf(d) + lowOf(d) + closeOf(d)) / 3);
  for (let i = period - 1; i < data.length; i++) {
    const slice = typical.slice(i - period + 1, i + 1);
    const mean = slice.reduce((s, v) => s + v, 0) / period;
    const meanDeviation = slice.reduce((s, v) => s + Math.abs(v - mean), 0) / period;
    out[i] = meanDeviation === 0 ? 0 : +((typical[i] - mean) / (0.015 * meanDeviation)).toFixed(2);
  }
  return out;
}
