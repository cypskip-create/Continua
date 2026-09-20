/**
 * Generic RSS/Atom adapter (§13, Phase 7) — unlike the NSE adapter,
 * this is NOT built around one hardcoded site. Any source with
 * `adapter: 'rss'` and a `feedUrl` in its config works with this same
 * code (§10-11: "adding a new source should mean adding an adapter, not
 * rewriting the crawler" — this is that principle applied to an entire
 * category of sources, not just one).
 *
 * Verified against a real RSS 2.0 feed (hnrss.org) and a hand-built
 * Atom 1.0 sample during development — rss-parser normalizes both into
 * the same item shape (title/link/pubDate|isoDate/creator|author/guid).
 * Not tested against Business Daily Africa or Kenya News Agency
 * specifically — both explicitly disallow automated access via
 * robots.txt (confirmed while researching this phase), so this adapter
 * will correctly refuse to run against them, same as any other source
 * that opts out.
 *
 * The RSS feed is only the DISCOVERY mechanism — per §13, the actual
 * document to preserve is the full article page, not just the feed's
 * summary. discover() returns one SourceDocument per feed item; fetch()
 * downloads the linked article page itself.
 *
 * Body text extraction (parse()) is a basic heuristic — see
 * extraction/articleBodyText.ts's header comment for exactly how basic.
 * Not comparable to a real boilerplate-removal library.
 */
import Parser from "rss-parser";
import * as cheerio from "cheerio";
import { fetchWithRetry } from "../../crawler/httpClient.js";
import { isAllowedByRobots } from "../../crawler/robotsCheck.js";
import { sha256 } from "../../crawler/hash.js";
import { storeRawArtifact } from "../../storage/rawStorage.js";
import { upsertArtifact } from "../../storage/rawArtifactsRepository.js";
import { extractArticleBodyText } from "../../extraction/articleBodyText.js";
import { resolveUrl } from "../../crawler/urlNormalize.js";
import { logger } from "../../monitoring/logger.js";
import { env } from "../../config/index.js";
import type { FetchedDocument, ParsedExtraction, SourceAdapter, SourceDocument } from "../types.js";
import type { Source } from "../../types.js";

const CRAWLER_VERSION = "scraper-phase7-0.1.0";
const MIN_BODY_TEXT_LENGTH = 100;

const rssParser = new Parser();

/**
 * Best-effort og:image/twitter:image lookup for a single article page.
 * Deliberately narrow — this is not htmlExtract.ts's full OpenGraph
 * sweep (that's for the generic crawler's link-discovery pass); RSS
 * articles only need the one field, and only when the publisher set it.
 * Absent, empty, or malformed values all resolve to null rather than
 * throwing, since a missing thumbnail is normal and shouldn't fail the
 * whole article.
 */
function extractImageUrl(html: string, pageUrl: string): string | null {
  const $ = cheerio.load(html);
  const raw =
    $('meta[property="og:image"]').attr("content") ??
    $('meta[name="twitter:image"]').attr("content") ??
    null;
  if (!raw) return null;
  return resolveUrl(pageUrl, raw);
}

export function createRssFeedAdapter(source: Source): SourceAdapter {
  const feedUrl = source.config.feedUrl;
  if (!feedUrl) {
    throw new Error(`Source '${source.id}' uses the rss adapter but has no config.feedUrl set`);
  }
  const requestsPerSecond = source.config.requestsPerSecond ?? env.DEFAULT_REQUESTS_PER_SECOND;

  return {
    id: source.id,

    async discover(): Promise<SourceDocument[]> {
      const allowed = await isAllowedByRobots(feedUrl);
      if (!allowed) {
        logger.warn({ sourceId: source.id, feedUrl }, "RSS feed disallowed by robots.txt — discover() returning nothing");
        return [];
      }

      const res = await fetchWithRetry(feedUrl, { requestsPerSecond });
      if (res.status >= 400) {
        throw new Error(`Failed to fetch RSS feed ${feedUrl}: HTTP ${res.status}`);
      }

      const feed = await rssParser.parseString(res.body.toString("utf-8"));
      const docs: SourceDocument[] = (feed.items ?? [])
        .filter((item) => !!item.link)
        .map((item) => ({
          url: item.link!,
          title: item.title ?? null,
          discoveredFrom: feedUrl,
          context: {
            publishedAt: item.isoDate ?? item.pubDate ?? null,
            author: item.creator ?? item.author ?? null,
            guid: item.guid ?? item.id ?? null,
            categories: item.categories ?? [],
          },
        }));

      logger.info({ sourceId: source.id, count: docs.length }, "RSS discover() found feed items");
      return docs;
    },

    async fetch(document: SourceDocument): Promise<FetchedDocument> {
      const res = await fetchWithRetry(document.url, { requestsPerSecond });
      if (res.status >= 400) {
        throw new Error(`Failed to fetch ${document.url}: HTTP ${res.status}`);
      }
      const contentType = res.headers.get("content-type");
      const bodyHash = sha256(res.body);
      const storagePath = await storeRawArtifact({
        sourceId: source.id,
        sha256: bodyHash,
        contentType,
        body: res.body,
      });

      const { artifact, isNew } = await upsertArtifact({
        sourceId: source.id,
        adapter: "rss",
        sha256: bodyHash,
        documentUrl: res.finalUrl,
        sourceUrl: document.discoveredFrom,
        contentType,
        sizeBytes: res.body.byteLength,
        storagePath,
        title: document.title ?? null,
        publishedAt: (document.context?.publishedAt as string | null) ?? null,
        crawlerVersion: CRAWLER_VERSION,
        metadata: document.context ?? {},
      });

      return {
        document,
        sha256: bodyHash,
        contentType,
        sizeBytes: res.body.byteLength,
        storagePath,
        body: res.body,
        isNewArtifact: isNew,
        artifactId: artifact.id,
      };
    },

    async parse(fetched: FetchedDocument): Promise<ParsedExtraction> {
      const isHtml = (fetched.contentType ?? "").includes("text/html");
      if (!isHtml) {
        return {
          method: "html",
          confidence: null,
          text: null,
          tables: [],
          entity: { companyName: null, ticker: null, exchange: "N/A", imageUrl: null },
          needsReview: true,
        };
      }

      const html = fetched.body.toString("utf-8");
      const bodyText = extractArticleBodyText(html);
      const looksUsable = bodyText.length >= MIN_BODY_TEXT_LENGTH;
      const imageUrl = extractImageUrl(html, fetched.document.url);

      return {
        method: "html",
        // Capped well below native PDF text extraction's ceiling — this
        // is a basic heuristic, not a verified structural parse (see
        // articleBodyText.ts).
        confidence: looksUsable ? 0.6 : 0.1,
        text: looksUsable ? bodyText : null,
        tables: [],
        entity: {
          // Never inferred from article text — §12 applies here too,
          // not just to NSE. A news article mentioning a company by name
          // is not the same as confidently identifying it; that's
          // downstream entity-resolution work (§13: "the data layer can
          // later perform entity extraction").
          companyName: null,
          ticker: null,
          exchange: "N/A",
          imageUrl,
        },
        needsReview: !looksUsable,
      };
    },
  };
}