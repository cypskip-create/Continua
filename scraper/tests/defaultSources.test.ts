import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/continua_test";
process.env.LOG_LEVEL ??= "fatal";
const { DEFAULT_SOURCES } = await import("../src/config/defaultSources.js");

describe("recurring publisher sources", () => {
  it('registers additional first-party archives with valid staggered schedules',()=>{
    for(const id of ['eabl-filings','coop-filings','kengen-filings']) {
      const source=DEFAULT_SOURCES.find(item=>item.id===id)!;
      expect(source.config.documents?.pdf).toBe(true);
      const [minute,hour]=String(source.config.schedule).split(' ').map(Number);
      expect(minute).toBeLessThan(60); expect(hour).toBeLessThan(24);
      expect(source.redistributionAllowed).toBeNull();
    }
  });
  it.each([
    ["techtrendske-rss", "techtrendske.co.ke", "/feed/"],
    ["soko-directory-rss", "sokodirectory.com", "/feed/"],
    ["business-daily-rss", "www.businessdailyafrica.com", "/service/rss/bd/1939132/feed.rss"],
  ])("uses the publisher feed, not a tracked article: %s", (id, host, path) => {
    const source = DEFAULT_SOURCES.find(item => item.id === id)!;
    expect(source.adapter).toBe("rss");
    const feed = new URL(source.config.feedUrl!);
    expect(feed.hostname).toBe(host);
    expect(feed.pathname).toBe(path);
    expect(feed.search).toBe("");
    expect(source.termsUrl).toBe(`https://${host}/`);
    expect(source.config.schedule).toBe("*/5 * * * *");
  });
});
