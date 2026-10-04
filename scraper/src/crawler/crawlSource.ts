/**
 * The generic crawl loop (§2-3, §30-31): fetch a batch of queued URLs for
 * a source, detect content type, extract links from HTML pages, record
 * new discoveries within depth/domain limits, store the raw artifact, and
 * mark crawl_state accordingly.
 *
 * Deliberately sequential — one source, one URL at a time. A real job
 * queue (Redis/BullMQ) is still deferred until actual load justifies the
 * complexity; retry/backoff and per-host rate limiting (Phase 6) don't
 * require one.
 *
 * NO source-specific rules live here. This only knows about HTML/generic
 * pages; PDFs are discovered (their links get recorded) but not yet
 * downloaded/parsed — that's the NSE adapter's job (announcementsAdapter.ts).
 */
import { logger } from "../monitoring/logger.js";
import { getSource } from "../storage/sourcesRepository.js";
import {
  recordDiscovered,
  claimNextBatch,
  markCrawling,
  markCrawled,
  markFailed,
} from "../storage/crawlStateRepository.js";
import { upsertArtifact } from "../storage/rawArtifactsRepository.js";
import { storeRawArtifact } from "../storage/rawStorage.js";
import { recordDeadLetter } from "../storage/deadLettersRepository.js";
import { fetchWithRetry, FetchTooLargeError, FetchTimeoutError } from "./httpClient.js";
import { UnsafeUrlError } from "./urlSafety.js";
import { isAllowedByRobots } from "./robotsCheck.js";
import { extractFromHtml } from "./htmlExtract.js";
import { canonicalizeUrl, isSameOrSubdomain } from "./urlNormalize.js";
import { sha256 } from "./hash.js";
import { env } from "../config/index.js";
import { matchesDiscoveryPaths } from "./discoveryPolicy.js";

const CRAWLER_VERSION = "scraper-phase6-0.1.0";

export interface CrawlSummary {
  sourceId: string;
  visited: number;
  discovered: number;
  stored: number;
  failed: number;
}

/** Seeds a source's crawl_state with its configured seed URLs, if not already present. */
async function seedIfNeeded(sourceId: string, seeds: string[], revisitAfterMinutes?: number): Promise<void> {
  for (const seed of seeds) {
    await recordDiscovered({ sourceId, url: seed, canonicalUrl: canonicalizeUrl(seed), depth: 0, revisitAfterMinutes });
  }
}

export async function crawlSource(sourceId: string, batchSize = 20): Promise<CrawlSummary> {
  const source = await getSource(sourceId);
  if (!source) throw new Error(`Unknown source: ${sourceId}`);
  if (!source.enabled) throw new Error(`Source ${sourceId} is disabled`);

  const seeds = source.config.seeds ?? [];
  const allowedDomains = source.config.allowedDomains ?? [];
  const maxDepth = source.config.maxDepth ?? 3;
  const requestsPerSecond = source.config.requestsPerSecond ?? env.DEFAULT_REQUESTS_PER_SECOND;

  await seedIfNeeded(sourceId, seeds, source.config.revisitAfterMinutes);

  const batch = await claimNextBatch(sourceId, batchSize);
  const summary: CrawlSummary = { sourceId, visited: 0, discovered: 0, stored: 0, failed: 0 };

  for (const item of batch) {
    summary.visited++;
    await markCrawling(item.id);

    try {
      const allowed = await isAllowedByRobots(item.url);
      if (!allowed) {
        await markFailed(item.id, "disallowed_by_robots_txt");
        summary.failed++;
        continue;
      }

      const res = await fetchWithRetry(item.url, { requestsPerSecond });
      const contentType = res.headers.get("content-type");
      const bodyHash = sha256(res.body);
      const changed = item.contentHash !== bodyHash;

      await markCrawled({
        id: item.id,
        httpStatus: res.status,
        mimeType: contentType,
        contentHash: bodyHash,
        changed,
      });

      if (res.status >= 400) {
        summary.failed++;
        continue;
      }

      // Store the raw artifact regardless of type — text extraction for
      // non-HTML types (PDF, CSV, ...) is Phase 2+. For now we just
      // preserve the bytes and provenance so nothing has to be
      // re-crawled once that logic exists.
      const storagePath = await storeRawArtifact({ sourceId, sha256: bodyHash, contentType, body: res.body });
      const { isNew } = await upsertArtifact({
        sourceId,
        adapter: source.adapter,
        sha256: bodyHash,
        documentUrl: res.finalUrl,
        sourceUrl: item.parentUrl,
        parentUrl: item.parentUrl,
        contentType,
        sizeBytes: res.body.byteLength,
        storagePath,
        crawlerVersion: CRAWLER_VERSION,
        title: source.config.issuerName ?? null,
      });
      if (isNew) summary.stored++;

      // Only HTML pages get link discovery — a PDF's bytes aren't parsed
      // for links here.
      const isHtml = (contentType ?? "").includes("text/html");
      if (isHtml && item.depth < maxDepth) {
        const html = res.body.toString("utf-8");
        const { links } = extractFromHtml(html, res.finalUrl);

        for (const link of links) {
          let linkUrl: URL;
          try {
            linkUrl = new URL(link.url);
          } catch {
            continue;
          }
          if (allowedDomains.length > 0 && !isSameOrSubdomain(linkUrl.hostname, allowedDomains)) continue;
          if (!matchesDiscoveryPaths(link.url, source.config.discoveryPaths)) continue;

          await recordDiscovered({
            sourceId,
            url: link.url,
            canonicalUrl: canonicalizeUrl(link.url),
            parentUrl: res.finalUrl,
            depth: item.depth + 1,
          });
          summary.discovered++;
        }
      }
    } catch (err) {
      const reason =
        err instanceof UnsafeUrlError
          ? `unsafe_url: ${err.message}`
          : err instanceof FetchTooLargeError
            ? `too_large: ${err.message}`
            : err instanceof FetchTimeoutError
              ? `timeout: ${err.message}`
              : `error: ${(err as Error).message}`;
      logger.warn({ url: item.url, reason }, "Crawl failed for URL");
      await markFailed(item.id, reason);
      // fetchWithRetry already exhausted retries internally before this
      // catch is ever reached — this dead-letter record is the final,
      // permanent record of that (§21: "record the exact reason").
      await recordDeadLetter({ sourceId, url: item.url, stage: "fetch", reason });
      summary.failed++;
    }
  }

  logger.info(summary, "Crawl pass complete");
  return summary;
}
