export type Sentiment = 'bullish' | 'bearish' | 'mixed' | 'neutral';
const positive = /\b(bullish|bull run|strong buy|buy the dip|accumulat\w*|undervalued|uptrend|breakout|rally\w*|outperform\w*|upside|kupanda|to the moon|diamond hands)\b|🚀|📈/gi;
const negative = /\b(bearish|strong sell|sell off|overvalued|downtrend|crash\w*|underperform\w*|downside|kushuka|dumping|profit warning)\b|📉|🔻/gi;

/** Conservative, explainable language signal, not investment advice. Plain
 * "up", "short" and "long" are deliberately excluded as ambiguous. */
export function classifyStockSentiment(content: string, symbol: string): Sentiment {
  let bull = 0, bear = 0;
  for (const clause of content.split(/(?:[.!?;\n]|\bbut\b|\bwhereas\b)/i)) {
    const tickers = [...clause.matchAll(/\$([A-Z][A-Z0-9.]*)\b/gi)].map(m => m[1].toUpperCase());
    if (tickers.length && !tickers.includes(symbol.toUpperCase())) continue;
    // Multiple symbols with unclear attribution are not assigned a direction.
    if (new Set(tickers).size > 1) continue;
    for (const [pattern, direction] of [[positive, 1], [negative, -1]] as const) {
      for (const match of clause.matchAll(pattern)) {
        const prefix = clause.slice(Math.max(0, match.index! - 35), match.index);
        if (/\b(not|never|no|isn't|isn’t|wasn't|wasn’t|avoid)\s+(?:\w+\s+){0,2}$/i.test(prefix)) continue;
        if (direction > 0) bull++; else bear++;
      }
    }
  }
  return bull && bear ? 'mixed' : bull ? 'bullish' : bear ? 'bearish' : 'neutral';
}
