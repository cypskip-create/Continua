/**
 * The bridge from continua-scraper's `scraping` schema into `market` —
 * without this, everything the scraper produces is invisible to the app.
 * See the migration's header comment for why this targets a lightweight
 * announcements table rather than the structured financial tables.
 *
 * Reads scraping.extractions directly (same Postgres instance, same
 * connection — this is a cross-schema query, not a service call) for
 * rows that don't have a corresponding market.company_announcements row
 * yet, resolves the company entity conservatively, and upserts.
 * Idempotent: re-running finds nothing new to do once everything's caught
 * up, matching the "running the same job twice must not duplicate
 * records" requirement (§44 of the scraper spec).
 *
 * Excludes adapter='rss' extractions — those are general news articles,
 * not company filings, and belong in market.news_items via
 * newsIngestionPipeline.ts instead (which also allows an article to
 * resolve to SEVERAL companies, unlike this single-company shape).
 */
import { query } from "../../storage/db.js";
import { companyAnnouncementsRepository } from "../../storage/repositories/companyAnnouncementsRepository.js";
import { resolveCompanyEntity } from "../entityResolution/resolveCompanyEntity.js";
import { deadLetterRepository } from "../../storage/repositories/deadLetterRepository.js";
import { ingestionLogRepository } from "../../storage/repositories/ingestionLogRepository.js";
import { logger } from "../../monitoring/logger.js";

const EXCERPT_LENGTH = 500;

interface PendingExtractionRow {
  extractionId: number;
  confidence: string | null;
  needsReview: boolean;
  text: string | null;
  artifactId: number;
  documentUrl: string;
  title: string | null;
  sourceId: string;
  entity: { companyName?: string | null; ticker?: string | null; exchange?: string } | null;
}

async function fetchPendingExtractions(limit: number): Promise<PendingExtractionRow[]> {
  const res = await query<PendingExtractionRow>(
    `SELECT e.id as "extractionId", e.confidence, e.needs_review as "needsReview", e.text, e.entity,
            a.id as "artifactId", a.document_url as "documentUrl", a.title, a.source_id as "sourceId"
     FROM scraping.extractions e
     JOIN scraping.raw_artifacts a ON a.id = e.artifact_id
     WHERE a.adapter != 'rss'
       AND NOT EXISTS (
       SELECT 1 FROM market.company_announcements ca WHERE ca.scraped_extraction_id = e.id
     )
     ORDER BY e.extracted_at ASC
     LIMIT $1`,
    [limit],
  );
  return res.rows;
}

export interface AnnouncementsBridgeSummary {
  processed: number;
  resolved: number;
  unresolved: number;
  failed: number;
}

export async function runAnnouncementsBridge(exchange = "NSE", batchSize = 100): Promise<AnnouncementsBridgeSummary> {
  const startedAt = new Date().toISOString();
  const pending = await fetchPendingExtractions(batchSize);
  const summary: AnnouncementsBridgeSummary = { processed: 0, resolved: 0, unresolved: 0, failed: 0 };
  const errors: string[] = [];

  for (const row of pending) {
    summary.processed++;
    try {
      const rawCompanyName = row.entity?.companyName ?? row.title ?? null;
      const resolved = rawCompanyName ? await resolveCompanyEntity(rawCompanyName, exchange) : null;

      if (resolved) summary.resolved++;
      else summary.unresolved++;

      await companyAnnouncementsRepository.upsert({
        companyId: resolved?.companyId ?? null,
        securityId: resolved?.securityId ?? null,
        rawCompanyName,
        title: row.title ?? "(untitled)",
        documentUrl: row.documentUrl,
        source: row.sourceId,
        exchange,
        scrapedArtifactId: row.artifactId,
        scrapedExtractionId: row.extractionId,
        extractionConfidence: row.confidence !== null ? Number(row.confidence) : null,
        needsReview: row.needsReview,
        excerpt: row.text ? row.text.slice(0, EXCERPT_LENGTH) : null,
        publishedAt: null, // not reliably available from source metadata yet — left honest rather than guessed
      });
    } catch (err) {
      const message = `extraction ${row.extractionId}: ${String(err)}`;
      errors.push(message);
      summary.failed++;
      await deadLetterRepository.record({
        exchange,
        dataset: "announcement",
        symbol: null,
        payload: { extractionId: row.extractionId, documentUrl: row.documentUrl },
        error: String(err),
      });
    }
  }

  await ingestionLogRepository.log({
    exchange: exchange as any,
    dataset: "announcement",
    status: summary.failed === 0 ? "success" : summary.processed > summary.failed ? "partial" : "failed",
    recordCount: summary.processed - summary.failed,
    errorCount: summary.failed,
    startedAt,
    finishedAt: new Date().toISOString(),
    errors: errors.length > 0 ? errors : undefined,
  });

  logger.info(summary, "Announcements bridge run complete");
  return summary;
}