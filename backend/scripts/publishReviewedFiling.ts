/** Operator-reviewed transcription for scanned filings. Never an automatic OCR publisher. */
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { pool, query } from "../src/storage/db.js";
import { HistoricalConfirmSchema, confirmHistoricalColumns } from "../src/ingestion/confirmHistoricalColumns.js";
import { financialStatementCandidatesRepository } from "../src/storage/repositories/financialStatementCandidatesRepository.js";
const schema = z.object({
  artifactId:z.number().int().positive(), sha256:z.string().regex(/^[a-f0-9]{64}$/),
  documentUrl:z.string().url(), identitySourceUrl:z.string().url(),
  entries:z.array(z.object({tableIndex:z.number().int().nonnegative(), table:z.object({
    title:z.string(),headerLine:z.string(),rows:z.array(z.object({label:z.string(),values:z.array(z.string())})).min(1),
  }), confirmation:HistoricalConfirmSchema})).min(1),
});
try {
  const filename=process.argv[2]; if(!filename) throw new Error("Usage: tsx scripts/publishReviewedFiling.ts review.json [--reviewed]");
  const input=schema.parse(JSON.parse(await readFile(filename,"utf8")));
  const artifact=(await query("SELECT a.*,e.id AS extraction_id FROM scraping.raw_artifacts a JOIN LATERAL (SELECT id FROM scraping.extractions WHERE artifact_id=a.id ORDER BY extracted_at DESC LIMIT 1) e ON true WHERE a.id=$1",[input.artifactId])).rows[0];
  if(!artifact || artifact.sha256!==input.sha256 || artifact.document_url!==input.documentUrl) throw new Error("Source provenance mismatch; no publication");
  for(const entry of input.entries) {
    const security=(await query("SELECT id,company_id FROM market.securities WHERE id=$1 AND exchange='NSE' AND status='active'",[entry.confirmation.securityId])).rows[0];
    if(!security) throw new Error("Reviewed issuer must resolve to an active NSE security");
    if(!process.argv.includes("--reviewed")) continue;
    const existing=(await query("SELECT id::text,status FROM market.financial_statement_candidates WHERE scraped_extraction_id=$1 AND table_index=$2",[artifact.extraction_id,entry.tableIndex])).rows[0];
    if(existing?.status==='confirmed') { console.log(JSON.stringify({candidateId:existing.id,status:"already_reviewed"})); continue; }
    if(existing) throw new Error("Existing automated candidate needs separate review; refusing to replace its source table");
    await financialStatementCandidatesRepository.upsert({companyId:security.company_id,securityId:security.id,
      rawCompanyName:artifact.title,source:artifact.source_id,exchange:"NSE",documentUrl:artifact.document_url,
      documentTitle:artifact.title,tableIndex:entry.tableIndex,
      detectedTable:{...entry.table,method:"operator_visual_transcription",confidence:1,identitySourceUrl:input.identitySourceUrl},
      detectionConfidence:1,scrapedArtifactId:artifact.id,scrapedExtractionId:artifact.extraction_id});
    const candidate=(await query("SELECT id::text FROM market.financial_statement_candidates WHERE scraped_extraction_id=$1 AND table_index=$2",[artifact.extraction_id,entry.tableIndex])).rows[0];
    console.log(JSON.stringify(await confirmHistoricalColumns(candidate.id,entry.confirmation)));
  }
  if(!process.argv.includes("--reviewed")) console.log("Reviewed transcription and source provenance validated. No database changes made.");
} catch(error) { console.error(error instanceof z.ZodError ? "Invalid reviewed transcription" : (error as Error).message); process.exitCode=1; }
finally { await pool.end(); }
