import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import Parser from "rss-parser";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/continua_test";
process.env.LOG_LEVEL ??= "fatal";

const { createRssFeedAdapter } = await import("../../../src/adapters/rss/createRssFeedAdapter.js");

const FIXTURE_PATH = path.join(import.meta.dirname, "../fixtures/real-rss-feed.xml");

describe("createRssFeedAdapter", () => {
  it("throws a clear error when the source has no feedUrl configured", () => {
    expect(() =>
      createRssFeedAdapter({
        id: "test-rss",
        name: "Test",
        adapter: "rss",
        enabled: true,
        config: {}, // no feedUrl
        termsUrl: null,
        robotsUrl: null,
        license: null,
        allowedUsage: null,
        redistributionAllowed: null,
        attributionRequired: null,
        createdAt: "",
        updatedAt: "",
      }),
    ).toThrow(/feedUrl/);
  });

  it("does not throw when feedUrl is configured", () => {
    expect(() =>
      createRssFeedAdapter({
        id: "test-rss",
        name: "Test",
        adapter: "rss",
        enabled: true,
        config: { feedUrl: "https://example.com/feed.xml" },
        termsUrl: null,
        robotsUrl: null,
        license: null,
        allowedUsage: null,
        redistributionAllowed: null,
        attributionRequired: null,
        createdAt: "",
        updatedAt: "",
      }),
    ).not.toThrow();
  });
});

describe("rss-parser field shapes (locks in the assumptions discover() relies on)", () => {
  it("parses a real RSS 2.0 feed into the fields the adapter reads", async () => {
    const xml = await readFile(FIXTURE_PATH, "utf-8");
    const parser = new Parser();
    const feed = await parser.parseString(xml);

    expect(feed.items.length).toBeGreaterThan(0);
    const item = feed.items[0]!;

    // These are exactly the fields createRssFeedAdapter's discover() reads —
    // if rss-parser ever changes this shape, this test catches it before
    // a real crawl silently produces empty/wrong SourceDocuments.
    expect(item.link).toBeTruthy();
    expect(item.title).toBeTruthy();
    expect(item.isoDate ?? item.pubDate).toBeTruthy();
    expect(item.creator ?? item.author).toBeTruthy();
    expect(item.guid ?? item.id).toBeTruthy();
  });
});
