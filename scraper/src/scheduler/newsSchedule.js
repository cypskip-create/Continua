/** News cadence is independent of slow issuer/filing crawls. */
export function sourceSchedule(source, newsCron, fallback) {
    return source.adapter === "rss" ? newsCron : source.config.schedule ?? fallback;
}
/** Some publishers return oldest-first feeds. Process latest dated items first. */
export function newestFeedItems(items) {
    const time = (item) => { const value = Date.parse(item.isoDate ?? item.pubDate ?? ""); return Number.isFinite(value) ? value : 0; };
    return [...items].sort((a, b) => time(b) - time(a));
}
