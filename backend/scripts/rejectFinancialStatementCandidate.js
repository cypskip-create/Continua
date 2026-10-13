/**
 * CLI: reject a financial statement candidate (bad table detection, wrong
 * company match, duplicate of an already-confirmed period, etc.) so it
 * stops showing up in `npm run financials:review`.
 *   npm run financials:reject -- 42 "duplicate of candidate 41"
 */
import { financialStatementCandidatesRepository } from "../src/storage/repositories/financialStatementCandidatesRepository.js";
import { pool } from "../src/storage/db.js";
async function main() {
    const candidateId = process.argv[2];
    const note = process.argv[3] ?? null;
    if (!candidateId) {
        console.error('Usage: npm run financials:reject -- <candidateId> ["reason"]');
        process.exit(1);
    }
    const candidate = await financialStatementCandidatesRepository.getById(candidateId);
    if (!candidate)
        throw new Error(`No candidate with id ${candidateId}`);
    await financialStatementCandidatesRepository.markReviewed(candidateId, "rejected", note, null);
    console.log(`Rejected candidate ${candidateId}.${note ? ` Note: ${note}` : ""}`);
    await pool.end();
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
