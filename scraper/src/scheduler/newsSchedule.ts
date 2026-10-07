import type { Source } from "../types.js";

/** News cadence is independent of slow issuer/filing crawls. */
export function sourceSchedule(source: Pick<Source, "adapter" | "config">, newsCron: string, fallback: string): string {
  return source.adapter === "rss" ? newsCron : source.config.schedule ?? fallback;
}

/** Some publishers return oldest-first feeds. Process latest dated items first. */
export function newestFeedItems<T extends { isoDate?: string; pubDate?: string }>(items: T[]): T[] {
  const time = (item: T) => { const value = Date.parse(item.isoDate ?? item.pubDate ?? ""); return Number.isFinite(value) ? value : 0; };
  return [...items].sort((a, b) => time(b) - time(a));
}
