import type { SourceDefinition } from "../types.js";
import { insertSourceIfMissing } from "../storage/sourcesRepository.js";

/** Public first-party feeds. Continua stores provenance, a short excerpt,
 * attribution, and the canonical source link; it does not republish full
 * articles. Operators can disable or edit any seeded row and that choice is
 * preserved because startup only inserts missing IDs. */
export const DEFAULT_SOURCES: SourceDefinition[] = [
  {
    id: "nse",
    name: "Nairobi Securities Exchange",
    adapter: "nse",
    enabled: true,
    config: { schedule: "*/30 * * * *", requestsPerSecond: 0.5, concurrency: 1 },
    termsUrl: "https://www.nse.co.ke/",
    robotsUrl: "https://www.nse.co.ke/robots.txt",
    license: null,
    allowedUsage: "Public listed-company announcements; retain source attribution and canonical link.",
    redistributionAllowed: null,
    attributionRequired: true,
  },
  {
    id: "standard-business-rss",
    name: "The Standard Business",
    adapter: "rss",
    enabled: true,
    config: {
      feedUrl: "https://www.standardmedia.co.ke/rss/business.php",
      schedule: "*/15 * * * *",
      requestsPerSecond: 0.5,
      concurrency: 2,
      maxItemsPerRun: 50,
    },
    termsUrl: "https://www.standardmedia.co.ke/rssfeeds?categoryID=9",
    robotsUrl: "https://www.standardmedia.co.ke/robots.txt",
    license: "Publisher RSS feed",
    allowedUsage: "Headline and short feed/article excerpt with attribution and canonical link.",
    redistributionAllowed: null,
    attributionRequired: true,
  },
  {
    id: "nairobi-leo-business-rss",
    name: "Nairobi Leo Business",
    adapter: "rss",
    enabled: true,
    config: {
      feedUrl: "https://nairobileo.co.ke/feed/business",
      schedule: "*/15 * * * *",
      requestsPerSecond: 0.5,
      concurrency: 2,
      maxItemsPerRun: 50,
    },
    termsUrl: "https://nairobileo.co.ke/feeds",
    robotsUrl: "https://nairobileo.co.ke/robots.txt",
    license: "Publisher RSS feed",
    allowedUsage: "Headline and short feed/article excerpt with attribution and canonical link.",
    redistributionAllowed: null,
    attributionRequired: true,
  },
];

export async function ensureDefaultSources(): Promise<void> {
  await Promise.all(DEFAULT_SOURCES.map(insertSourceIfMissing));
}
