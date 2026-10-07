import { describe, expect, it } from "vitest";
import { newestFeedItems, sourceSchedule } from "../src/scheduler/newsSchedule.js";

describe("ten-minute publisher news", () => {
  it("overrides stale stored RSS schedules without changing filing schedules", () => {
    expect(sourceSchedule({ adapter: "rss", config: { schedule: "12 */2 * * *" } }, "*/10 * * * *", "0 */6 * * *")).toBe("*/10 * * * *");
    expect(sourceSchedule({ adapter: "web", config: { schedule: "0 2 * * *" } }, "*/10 * * * *", "0 */6 * * *")).toBe("0 2 * * *");
    expect(sourceSchedule({ adapter: "nse", config: {} }, "*/10 * * * *", "0 */6 * * *")).toBe("0 */6 * * *");
  });
  it("prioritizes current headlines, tolerates invalid dates, and does not mutate the feed", () => {
    const feed = [{ pubDate: "2026-10-01", title: "old" }, { pubDate: "bad", title: "unknown" }, { isoDate: "2026-10-07", title: "new" }];
    expect(newestFeedItems(feed).map(item => item.title)).toEqual(["new", "old", "unknown"]);
    expect(feed[0]!.title).toBe("old");
  });
});
