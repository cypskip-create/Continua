/**
 * Financial table extraction from plain extracted text (§6, §34-35 of the
 * original spec). This does NOT use pdf-parse v2's built-in `getTable()`
 * — tested against several synthetic table PDFs (bordered and borderless)
 * and it returned empty results for both, so it isn't something to
 * depend on here. This heuristic instead works off the plain text
 * extractPdfText() already produces.
 *
 * The heuristic: a financial statement row is reliably "a label followed
 * by one or more numeric-looking values" (e.g. "Revenue 359,433
 * 340,120", "Cost of sales (101,216) (95,400)"). Consecutive rows
 * matching that shape are grouped into a table. The line immediately
 * above the first row is captured as context (`headerLine`) but
 * deliberately NOT split into per-column headers — without real x/y
 * character positions (which this text-based approach doesn't have),
 * confidently mapping header words to columns isn't possible, and
 * guessing would violate §37 ("do NOT silently fix/assume — flag
 * instead"). Downstream (continua-data) can do proper column alignment
 * against the raw row values if needed.
 */
export interface DetectedTableRow {
    label: string;
    values: string[];
}
export interface DetectedTable {
    title: string | null;
    headerLine: string | null;
    rows: DetectedTableRow[];
    method: "line_heuristic_v1";
    confidence: number;
}
export declare function extractTablesFromText(text: string): DetectedTable[];
