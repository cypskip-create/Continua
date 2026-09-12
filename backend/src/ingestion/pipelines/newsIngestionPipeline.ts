/**
 * The bridge from continua-scraper's generic RSS extractions into
 * market.news_items — same "read scraping.extractions directly, upsert
 * idempotently" shape as announcementsIngestionPipeline.ts and
 * financialStatementCandidatesBridge.ts, applied to adapter='rss' sources
 * specifically (general business/market news, as opposed to adapter='nse'
 * company filings, which the announcements bridge owns).
 *
 * Unlike the announcements bridge, there is no single "raw company name"
 * to resolve here — createRssFeedAdapter.ts's parse() always returns a
 * null entity for RSS articles (§13: entity extraction from free text is
 * downstream work, not the scraper's job). That downstream work is
 * resolveStockMentions.ts, called here with the article's full text.
 */
import { query } from "../../storage/db.js";
import { newsRepository } from "../../storage/repositories/newsRepository.js";
import { resolveStockMentions } from "../entityResolution/resolveStockMentions.js";
import { classifyNewsCategory } from "../entityResolution/classifyNewsCategory.js";
import { deadLetterRepository } from "../../storage/repositories/deadLetterRepository.js";
import { ingestionLogRepository } from "../../storage/repositories/ingestionLogRepository.js";
import { logger } from "../../monitoring/logger.js";

const EXCERPT_LENGTH = 400;

interface PendingNewsRow {
  extractionId: number;
  confidence: string | null;
  needsReview: boolean;
  text: string | null;
  artifactId: number;
  documentUrl: string;
  title: string | null;
  publishedAt: string | null;
  sourceId: string;
}

async function fetchPendingExtractions(limit: number): Promise<PendingNewsRow[]> {
  const res = await query<PendingNewsRow>(
    `SELECT e.id as "extractionId", e.confidence, e.needs_review as "needsReview", e.text,
            a.id as "artifactId", a.document_url as "documentUrl", a.title, a.published_at as "publishedAt",
            a.source_id as "sourceId"
     FROM scraping.extractions e
     JOIN scraping.raw_artifacts a ON a.id = e.artifact_id
     WHERE a.adapter = 'rss'
       AND NOT EXISTS (
         SELECT 1 FROM market.news_items n WHERE n.scraped_extraction_id = e.id
       )
     ORDER BY e.extracted_at ASC
     LIMIT $1`,
    [limit],
  );
  return res.rows;
}

export interface NewsBridgeSummary {
  processed: number;
  withMentions: number;
  withoutMentions: number;
  failed: number;
}

export async function runNewsBridge(exchange = "NSE", batchSize = 100): Promise<NewsBridgeSummary> {
  const startedAt = new Date().toISOString();
  const pending = await fetchPendingExtractions(batchSize);
  const summary: NewsBridgeSummary = { processed: 0, withMentions: 0, withoutMentions: 0, failed: 0 };
  const errors: string[] = [];

  // Cache source display names within this run — sources rarely change
  // mid-batch and this avoids one lookup per article. Reads directly from
  // scraping.sources; there's no backend-side sourcesRepository since
  // this is the only place continua-data needs source metadata (the
  // scraper owns that table's writes).
  const sourceNameCache = new Map<string, string>();

  for (const row of pending) {
    summary.processed++;
    try {
      if (!row.title || !row.text) {
        // No usable text (e.g. non-HTML content the adapter couldn't
        // extract from) — nothing to classify or match; skip rather than
        // create an empty/junk news item. Not a failure: this extraction
        // genuinely has nothing to bridge.
        continue;
      }

      let sourceName = sourceNameCache.get(row.sourceId);
      if (!sourceName) {
        const sourceRes = await query<{ name: string }>(`SELECT name FROM scraping.sources WHERE id = $1`, [row.sourceId]);
        sourceName = sourceRes.rows[0]?.name ?? row.sourceId;
        sourceNameCache.set(row.sourceId, sourceName);
      }

      const fullText = `${row.title}\n${row.text}`;
      const securityIds = await resolveStockMentions(fullText, exchange);
      const category = classifyNewsCategory(fullText);

      if (securityIds.length > 0) summary.withMentions++;
      else summary.withoutMentions++;

      await newsRepository.upsert({
        headline: row.title,
        excerpt: row.text.slice(0, EXCERPT_LENGTH),
        articleUrl: row.documentUrl,
        source: row.sourceId,
        sourceName,
        category,
        securityIds,
        scrapedArtifactId: row.artifactId,
        scrapedExtractionId: row.extractionId,
        extractionConfidence: row.confidence !== null ? Number(row.confidence) : null,
        // Honest signal for the ops queue: no resolved company mention on
        // an article that came from a company-focused/business feed is
        // worth a human glance, same as an unresolved announcement.
        needsReview: row.needsReview || securityIds.length === 0,
        publishedAt: row.publishedAt,
      });
    } catch (err) {
      const message = `extraction ${row.extractionId}: ${String(err)}`;
      errors.push(message);
      summary.failed++;
      await deadLetterRepository.record({
        exchange,
        dataset: "news",
        symbol: null,
        payload: { extractionId: row.extractionId, documentUrl: row.documentUrl },
        error: String(err),
      });
    }
  }

  await ingestionLogRepository.log({
    exchange: exchange as any,
    dataset: "news",
    status: summary.failed === 0 ? "success" : summary.processed > summary.failed ? "partial" : "failed",
    recordCount: summary.processed - summary.failed,
    errorCount: summary.failed,
    startedAt,
    finishedAt: new Date().toISOString(),
    errors: errors.length > 0 ? errors : undefined,
  });

  logger.info(summary, "News bridge run complete");
  return summary;
}