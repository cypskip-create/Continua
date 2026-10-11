import { query } from "../db.js";
import type { PoolClient } from 'pg';
import type { FinancialStatementCandidate } from "../../types/market.js";

interface CandidateRow {
  id: string;
  companyId: string | null;
  securityId: string | null;
  rawCompanyName: string | null;
  source: string;
  exchange: string;
  documentUrl: string;
  documentTitle: string | null;
  tableIndex: number;
  detectedTable: FinancialStatementCandidate["detectedTable"];
  detectionConfidence: string | null;
  scrapedArtifactId: number | null;
  scrapedExtractionId: number | null;
  status: FinancialStatementCandidate["status"];
  reviewedAt: string | null;
  reviewedNote: string | null;
  resultingPeriodId: string | null;
  createdAt: string;
}

function mapRow(row: CandidateRow): FinancialStatementCandidate {
  return {
    ...row,
    exchange: row.exchange as FinancialStatementCandidate["exchange"],
    detectionConfidence: row.detectionConfidence !== null ? Number(row.detectionConfidence) : null,
  };
}

const SELECT_COLUMNS = `
  id::text, company_id as "companyId", security_id as "securityId", raw_company_name as "rawCompanyName",
  source, exchange, document_url as "documentUrl", document_title as "documentTitle",
  table_index as "tableIndex", detected_table as "detectedTable", detection_confidence as "detectionConfidence",
  scraped_artifact_id as "scrapedArtifactId", scraped_extraction_id as "scrapedExtractionId",
  status, reviewed_at as "reviewedAt", reviewed_note as "reviewedNote",
  resulting_period_id as "resultingPeriodId", created_at as "createdAt"`;

export const financialStatementCandidatesRepository = {
  /**
   * Upsert keyed on (scraped_extraction_id, table_index) — idempotent, same
   * requirement as the announcements bridge (§44: re-running must not
   * duplicate). Always inserts as 'pending'; never overwrites a status a
   * human has already set on a re-run (ON CONFLICT only refreshes the
   * detection fields, not the review state).
   */
  async upsert(input: {
    companyId: string | null;
    securityId: string | null;
    rawCompanyName: string | null;
    source: string;
    exchange: string;
    documentUrl: string;
    documentTitle: string | null;
    tableIndex: number;
    detectedTable: unknown;
    detectionConfidence: number | null;
    scrapedArtifactId: number | null;
    scrapedExtractionId: number;
  }, transaction?: PoolClient): Promise<void> {
    const execute = transaction ? transaction.query.bind(transaction) : query;
    await execute(
      `INSERT INTO market.financial_statement_candidates
         (company_id, security_id, raw_company_name, source, exchange, document_url, document_title,
          table_index, detected_table, detection_confidence, scraped_artifact_id, scraped_extraction_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (scraped_extraction_id, table_index) DO UPDATE SET
         company_id = EXCLUDED.company_id,
         security_id = EXCLUDED.security_id,
         detected_table = EXCLUDED.detected_table,
         detection_confidence = EXCLUDED.detection_confidence,
         updated_at = now()`,
      [
        input.companyId,
        input.securityId,
        input.rawCompanyName,
        input.source,
        input.exchange,
        input.documentUrl,
        input.documentTitle,
        input.tableIndex,
        JSON.stringify(input.detectedTable),
        input.detectionConfidence,
        input.scrapedArtifactId,
        input.scrapedExtractionId,
      ],
    );
  },

  async listPending(limit = 100): Promise<FinancialStatementCandidate[]> {
    const res = await query<CandidateRow>(
      `SELECT ${SELECT_COLUMNS} FROM market.financial_statement_candidates
       WHERE status = 'pending' ORDER BY created_at ASC LIMIT $1`,
      [limit],
    );
    return res.rows.map(mapRow);
  },

  async getById(id: string): Promise<FinancialStatementCandidate | null> {
    const res = await query<CandidateRow>(`SELECT ${SELECT_COLUMNS} FROM market.financial_statement_candidates WHERE id = $1`, [id]);
    return res.rows[0] ? mapRow(res.rows[0]) : null;
  },

  async existsForExtractionTable(scrapedExtractionId: number, tableIndex: number): Promise<boolean> {
    const res = await query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM market.financial_statement_candidates WHERE scraped_extraction_id = $1 AND table_index = $2) as exists`,
      [scrapedExtractionId, tableIndex],
    );
    return res.rows[0]?.exists ?? false;
  },

  /** Marks a candidate reviewed — 'confirmed' also records which real
   *  financial_periods row it produced, closing the provenance loop from
   *  raw scrape to live figure. */
  async markReviewed(id: string, status: "confirmed" | "rejected", note: string | null, resultingPeriodId: string | null): Promise<void> {
    await query(
      `UPDATE market.financial_statement_candidates
       SET status = $2, reviewed_at = now(), reviewed_note = $3, resulting_period_id = $4, updated_at = now()
       WHERE id = $1`,
      [id, status, note, resultingPeriodId],
    );
  },
};
