/**
 * The bridge from continua-scraper's detected financial tables into a
 * `market` review queue — deliberately NOT into income_statements /
 * balance_sheets / cash_flow_statements directly. See the migration
 * header comment ("financial statement candidates bridge.sql") for why:
 * tableExtract.ts's rows aren't mapped to fiscal periods or canonical
 * line items, and guessing that mapping risks silently-wrong figures in
 * front of people making investment decisions.
 *
 * Reads scraping.extractions directly for rows with at least one detected
 * table that don't have a corresponding candidate row yet, resolves the
 * company entity conservatively (same resolveCompanyEntity as the
 * announcements bridge), and inserts one candidate row PER detected table
 * — a single results PDF often contains an income statement AND a balance
 * sheet as separate detected tables, and those need reviewing separately.
 * Idempotent, same as announcementsIngestionPipeline.
 */
import { query } from "../../storage/db.js";
import { financialStatementCandidatesRepository } from "../../storage/repositories/financialStatementCandidatesRepository.js";
import { resolveCompanyEntity } from "../entityResolution/resolveCompanyEntity.js";
import { deadLetterRepository } from "../../storage/repositories/deadLetterRepository.js";
import { ingestionLogRepository } from "../../storage/repositories/ingestionLogRepository.js";
import { logger } from "../../monitoring/logger.js";
import type { DetectedFinancialTable } from "../../types/market.js";

interface PendingExtractionRow {
  extractionId: number;
  confidence: string | null;
  tables: DetectedFinancialTable[];
  artifactId: number;
  documentUrl: string;
  title: string | null;
  sourceId: string;
  entity: { companyName?: string | null; ticker?: string | null; exchange?: string } | null;
}

async function fetchPendingExtractions(limit: number): Promise<PendingExtractionRow[]> {
  const res = await query<PendingExtractionRow>(
    `SELECT e.id as "extractionId", e.confidence, e.tables, e.entity,
            a.id as "artifactId", a.document_url as "documentUrl", a.title, a.source_id as "sourceId"
     FROM scraping.extractions e
     JOIN scraping.raw_artifacts a ON a.id = e.artifact_id
     WHERE jsonb_array_length(e.tables) > 0
       AND a.source_id NOT IN ('cbk-bond-history','cbk-bill-history','nse-market-reports','nse-index-summary')
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(e.tables) t WHERE jsonb_typeof(t->'rows')='array')
       AND NOT EXISTS (
         SELECT 1 FROM market.financial_statement_candidates c WHERE c.scraped_extraction_id = e.id
       )
     ORDER BY e.extracted_at ASC
     LIMIT $1`,
    [limit],
  );
  return res.rows;
}

export interface FinancialCandidatesBridgeSummary {
  extractionsProcessed: number;
  candidatesCreated: number;
  resolved: number;
  unresolved: number;
  failed: number;
}

export async function runFinancialStatementCandidatesBridge(exchange = "NSE", batchSize = 100): Promise<FinancialCandidatesBridgeSummary> {
  const startedAt = new Date().toISOString();
  const pending = await fetchPendingExtractions(batchSize);
  const summary: FinancialCandidatesBridgeSummary = { extractionsProcessed: 0, candidatesCreated: 0, resolved: 0, unresolved: 0, failed: 0 };
  const errors: string[] = [];

  for (const row of pending) {
    summary.extractionsProcessed++;
    try {
      const rawCompanyName = row.entity?.companyName ?? row.title ?? null;
      const resolved = rawCompanyName ? await resolveCompanyEntity(rawCompanyName, exchange) : null;
      if (resolved) summary.resolved++;
      else summary.unresolved++;

      for (let tableIndex = 0; tableIndex < row.tables.length; tableIndex++) {
        if (!Array.isArray(row.tables[tableIndex]?.rows)) continue;
        await financialStatementCandidatesRepository.upsert({
          companyId: resolved?.companyId ?? null,
          securityId: resolved?.securityId ?? null,
          rawCompanyName,
          source: row.sourceId,
          exchange,
          documentUrl: row.documentUrl,
          documentTitle: row.title,
          tableIndex,
          detectedTable: row.tables[tableIndex],
          detectionConfidence: row.tables[tableIndex]?.confidence ?? (row.confidence !== null ? Number(row.confidence) : null),
          scrapedArtifactId: row.artifactId,
          scrapedExtractionId: row.extractionId,
        });
        summary.candidatesCreated++;
      }
    } catch (err) {
      const message = `extraction ${row.extractionId}: ${String(err)}`;
      errors.push(message);
      summary.failed++;
      await deadLetterRepository.record({
        exchange,
        dataset: "financial_statement_candidate",
        symbol: null,
        payload: { extractionId: row.extractionId, documentUrl: row.documentUrl },
        error: String(err),
      });
    }
  }

  await ingestionLogRepository.log({
    exchange: exchange as any,
    dataset: "financial_statement_candidate",
    status: summary.failed === 0 ? "success" : summary.extractionsProcessed > summary.failed ? "partial" : "failed",
    recordCount: summary.candidatesCreated,
    errorCount: summary.failed,
    startedAt,
    finishedAt: new Date().toISOString(),
    errors: errors.length > 0 ? errors : undefined,
  });

  logger.info(summary, "Financial statement candidates bridge run complete");
  return summary;
}
