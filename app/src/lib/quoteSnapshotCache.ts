import type { Quote } from "@/api/types";

const PREFIX = "continua:quotes:v1:";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface StoredQuoteSnapshot {
  savedAt: number;
  quotes: Quote[];
}

export function readQuoteSnapshot(exchange: string, symbols: string[]): StoredQuoteSnapshot | null {
  try {
    const raw = localStorage.getItem(`${PREFIX}${exchange}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredQuoteSnapshot;
    if (!Array.isArray(parsed.quotes) || Date.now() - parsed.savedAt > MAX_AGE_MS) return null;
    const wanted = new Set(symbols.map((symbol) => symbol.toUpperCase()));
    const quotes = parsed.quotes.filter((quote) => wanted.has(quote.symbol.toUpperCase()));
    return quotes.length > 0 ? { savedAt: parsed.savedAt, quotes } : null;
  } catch {
    return null;
  }
}

export function writeQuoteSnapshot(exchange: string, quotes: Quote[]): void {
  if (quotes.length === 0) return;
  try {
    const key = `${PREFIX}${exchange}`;
    const existingRaw = localStorage.getItem(key);
    const merged = new Map<string, Quote>();
    if (existingRaw) {
      const existing = JSON.parse(existingRaw) as StoredQuoteSnapshot;
      if (Array.isArray(existing.quotes)) {
        existing.quotes.forEach((quote) => merged.set(quote.symbol.toUpperCase(), quote));
      }
    }
    quotes.forEach((quote) => merged.set(quote.symbol.toUpperCase(), quote));
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), quotes: [...merged.values()] }));
  } catch {
    // Storage can be unavailable in private browsing or full. Live data
    // still works; this cache only removes the empty-price flash on launch.
  }
}
