/**
 * CLI: draft a confirm-ready JSON file from a pending candidate's detected
 * table, so reviewing a candidate is "open two files side by side and
 * edit numbers that look wrong" instead of "type a JSON file from scratch
 * while cross-referencing a terminal dump."
 *   npm run financials:draft -- 42 [./review]
 *
 * This does NOT write anything to the database and does NOT confirm
 * anything — it only produces a file for `npm run financials:confirm` to
 * consume later, after a human has actually looked at it. Two things are
 * guessed here, and both are guesses, not facts, marked as such:
 *
 *   1. statementType — inferred by keyword-scoring the detected row
 *      labels against income/balance/cashflow vocabularies. Usually
 *      obvious (an "Earnings per share" row is not going to be a balance
 *      sheet) but not guaranteed — check it.
 *   2. which detected row maps to which target field (revenue, netIncome,
 *      totalAssets, ...) — same keyword approach, per label. A label with
 *      no confident match is NOT silently dropped: it's listed in
 *      "unmappedRows" in the output so nothing the scraper found is
 *      hidden from you, even if this script didn't know what to do with
 *      it.
 *
 * Every numeric value that DOES get filled in is copied verbatim from the
 * detected table's FIRST value column (numbers.parse on the string, sign
 * handling for "(1,234)"-style negatives) — never invented. If a
 * detected row has more than one value column (e.g. current year vs.
 * prior year), the others are listed in the printed table for reference,
 * not silently discarded.
 *
 * fiscalYear is best-effort extracted from the document title/header (a
 * 4-digit year found there) — left null if none is found, rather than
 * guessed from, say, today's date. periodEnd/reportedAt/currency are
 * ALWAYS left as placeholders (never guessed) — those are calendar facts
 * that must come from actually reading the source document.
 *
 * The guessing logic itself lives in src/ingestion/financialsDraft.ts,
 * shared with the admin API's browser-based review page — this script is
 * now just the CLI wrapper around it (file I/O, console output), for
 * anyone with shell access who prefers that over the web UI.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { financialStatementCandidatesRepository } from "../src/storage/repositories/financialStatementCandidatesRepository.js";
import { pool } from "../src/storage/db.js";
import { REVIEW_ME, guessStatementType, mapRowsToFields, guessFiscalYear } from "../src/ingestion/financialsDraft.js";

async function main() {
  const candidateId = process.argv[2];
  const outputDir = process.argv[3] ?? "./review";
  if (!candidateId) {
    console.error("Usage: npm run financials:draft -- <candidateId> [outputDir]");
    process.exit(1);
  }

  const candidate = await financialStatementCandidatesRepository.getById(candidateId);
  if (!candidate) throw new Error(`No candidate with id ${candidateId}`);
  if (candidate.status !== "pending") {
    console.error(`Candidate ${candidateId} is already '${candidate.status}' — nothing to draft.`);
    await pool.end();
    return;
  }

  const rows = candidate.detectedTable.rows;
  const statementType = guessStatementType(rows);
  const { mapped, unmapped } = mapRowsToFields(rows, statementType);
  const fiscalYear = guessFiscalYear(candidate.documentTitle, candidate.detectedTable.title, candidate.detectedTable.headerLine);

  const draft = {
    candidateId,
    ...(candidate.securityId ? {} : { securityId: REVIEW_ME }),
    statementType, // GUESS — verify against the printed table below
    period: {
      periodType: "annual", // GUESS — set to "quarterly" + fiscalQuarter if this is a quarterly report
      fiscalYear: fiscalYear ?? REVIEW_ME,
      fiscalQuarter: null,
      periodEnd: REVIEW_ME, // e.g. "2025-12-31" — read this off the actual document
      reportedAt: REVIEW_ME, // e.g. "2026-03-02" — the date this was published/filed
      currency: REVIEW_ME, // e.g. "KES"
    },
    [statementType]: mapped,
    note: `Drafted from candidate ${candidateId} (confidence ${candidate.detectionConfidence ?? "n/a"}) — VERIFY every number against the source before confirming.`,
  };

  mkdirSync(outputDir, { recursive: true });
  const outPath = `${outputDir}/candidate-${candidateId}.json`;
  writeFileSync(outPath, JSON.stringify(draft, null, 2));

  console.log(`Wrote draft: ${outPath}\n`);
  console.log(`Guessed statementType: ${statementType} — double-check this.`);
  if (!candidate.securityId) {
    console.log(`⚠ No resolved securityId — "${REVIEW_ME}" placeholder in the draft MUST be replaced (e.g. "NSE:SCOM").`);
  }
  console.log(`\nSource document: ${candidate.documentUrl}`);
  console.log(`Detected table title: ${candidate.detectedTable.title ?? "(none)"}   header: ${candidate.detectedTable.headerLine ?? "(none)"}\n`);

  console.log("Detected rows mapped into the draft:");
  for (const [field, value] of Object.entries(mapped)) {
    console.log(`  ${field.padEnd(20)} = ${value ?? "null"}`);
  }

  if (unmapped.length > 0) {
    console.log(`\n${unmapped.length} detected row(s) this script didn't know how to map (not in the draft — check if any of these matter):`);
    for (const row of unmapped) {
      console.log(`  ${row.label.padEnd(40)} ${row.values.join("  ")}`);
    }
  }

  console.log(`\nEvery "${REVIEW_ME}" in the file MUST be replaced by hand before running:\n  npm run financials:confirm -- ${outPath}`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});