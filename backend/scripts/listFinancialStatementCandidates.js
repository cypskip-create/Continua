/**
 * CLI: print pending financial statement candidates for review.
 *   npm run financials:review
 *
 * This is the actual review step — read the detected table for a
 * candidate, decide the fiscal period/currency/line-item mapping by
 * looking at the source document, then run confirmFinancialStatementCandidate.ts
 * with that mapping. Nothing here writes anything; it's read-only.
 */
import { financialStatementCandidatesRepository } from "../src/storage/repositories/financialStatementCandidatesRepository.js";
import { pool } from "../src/storage/db.js";
async function main() {
    const limit = Number(process.argv[2] ?? 50);
    const candidates = await financialStatementCandidatesRepository.listPending(limit);
    if (candidates.length === 0) {
        console.log("No pending financial statement candidates.");
    }
    else {
        console.log(`${candidates.length} pending candidate(s):\n`);
        for (const c of candidates) {
            console.log("─".repeat(72));
            console.log(`id: ${c.id}`);
            console.log(`company: ${c.rawCompanyName ?? "(unknown)"}  →  companyId: ${c.companyId ?? "UNRESOLVED"}`);
            console.log(`source: ${c.source} (${c.exchange})   document: ${c.documentUrl}`);
            console.log(`title: ${c.documentTitle ?? "(untitled)"}   table #${c.tableIndex}   confidence: ${c.detectionConfidence ?? "n/a"}`);
            console.log(`detected header: ${c.detectedTable.headerLine ?? "(none)"}`);
            console.log(`detected title:  ${c.detectedTable.title ?? "(none)"}`);
            console.log("rows:");
            for (const row of c.detectedTable.rows) {
                console.log(`  ${row.label.padEnd(40)} ${row.values.join("  ")}`);
            }
            console.log("");
        }
        console.log(`To confirm one: npm run financials:confirm -- ./path/to/candidate-${candidates[0].id}.json`);
        console.log("(see scripts/confirmFinancialStatementCandidate.ts for the file format)");
    }
    await pool.end();
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
