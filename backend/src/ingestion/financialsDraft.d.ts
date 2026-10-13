/**
 * The guessing logic originally inline in scripts/draftFinancialStatementCandidate.ts,
 * extracted so the admin API (adminFinancials.controller.ts) can pre-fill a
 * review form with the exact same best-effort mapping the CLI's `financials:draft`
 * produces, instead of drifting into a second implementation over time.
 *
 * Everything here is a GUESS, not a fact — see the CLI script's header
 * comment for the full reasoning. Nothing in this file writes to the
 * database; it only turns a detected table into "here's what we think
 * this row means," for a human to verify.
 */
import type { DetectedTableRow } from "../types/market.js";
export declare const REVIEW_ME = "REVIEW_ME";
export declare const FIELD_KEYWORDS: Record<"income" | "balance" | "cashflow", Record<string, string[]>>;
/** Scores each statement type by how many detected labels match its
 *  keyword set — the type with the most hits wins. Ties/no-hits fall
 *  back to "income" (the most common case) but the caller must still
 *  treat this as a guess, not a fact. */
export declare function guessStatementType(rows: DetectedTableRow[]): "income" | "balance" | "cashflow";
/** "(1,234.5)" → -1234.5, "1,234.5" → 1234.5, "—"/"-"/"" → null. */
export declare function parseNumber(raw: string | undefined): number | null;
export declare function guessFiscalYear(...texts: (string | null)[]): number | null;
export declare function mapRowsToFields(rows: DetectedTableRow[], statementType: "income" | "balance" | "cashflow", columnIndex?: number): {
    mapped: Record<string, number | null>;
    unmapped: DetectedTableRow[];
};
/** Keep every comparative column. Dates, units and scope require review. */
export declare function historicalColumnDrafts(rows: DetectedTableRow[], type: "income" | "balance" | "cashflow"): {
    mapped: Record<string, number | null>;
    unmapped: DetectedTableRow[];
    columnIndex: number;
}[];
