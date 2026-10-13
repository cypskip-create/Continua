import type { Source } from "../types.js";
/** News cadence is independent of slow issuer/filing crawls. */
export declare function sourceSchedule(source: Pick<Source, "adapter" | "config">, newsCron: string, fallback: string): string;
/** Some publishers return oldest-first feeds. Process latest dated items first. */
export declare function newestFeedItems<T extends {
    isoDate?: string;
    pubDate?: string;
}>(items: T[]): T[];
