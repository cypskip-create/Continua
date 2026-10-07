interface Signal { type: string; latest: number | { histogram: number | null } | null; timestamps: string[] }
export function buildResearchSynthesis(price: number | null, signals: Signal[], risks: string[], unavailable: string[]) {
  const observations: { topic: string; text: string; asOf: string | null }[] = [];
  const value = (type: string) => signals.find(item => item.type === type);
  const rsi = value("RSI"), average = value("SMA"), momentum = value("MACD");
  const asOf = (signal: Signal) => signal.timestamps[signal.timestamps.length - 1] ?? null;
  if (rsi && typeof rsi.latest === "number" && Number.isFinite(rsi.latest)) observations.push({ topic: "Momentum", text: rsi.latest >= 70 ? "RSI is at or above 70: elevated momentum can persist, so this alone is not a reversal signal." : rsi.latest <= 30 ? "RSI is at or below 30: weak momentum can persist, so this alone is not a recovery signal." : "RSI is between 30 and 70, outside the conventional extreme bands.", asOf: asOf(rsi) });
  if (average && typeof average.latest === "number" && Number.isFinite(average.latest) && price != null && Number.isFinite(price) && price > 0) observations.push({ topic: "Price trend", text: "Latest quote is " + (price >= average.latest ? "above" : "below") + " the 20-session moving average. Quote and daily-candle timestamps can differ.", asOf: asOf(average) });
  if (momentum && momentum.latest && typeof momentum.latest === "object" && momentum.latest.histogram != null && Number.isFinite(momentum.latest.histogram)) observations.push({ topic: "Trend confirmation", text: "MACD histogram is " + (momentum.latest.histogram >= 0 ? "non-negative" : "negative") + "; compare this momentum reading with the company’s reported performance.", asOf: asOf(momentum) });
  const checklist = [...risks.map(text => ({ topic: "Fundamental risk", text, asOf: null })), ...unavailable.map(name => ({ topic: "Data coverage", text: name + " could not be loaded; the analysis is incomplete.", asOf: null }))];
  return { observations, checklist, methodology: "Rule-based synthesis of reported fundamentals and SMA(20), RSI(14), MACD(12,26,9). Signals are observations, not trade recommendations or price forecasts." };
}
