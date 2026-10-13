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
// Matches financial-style numeric tokens: optional leading '(' or '-'
// (negative/loss notation), digits with optional thousands separators
// and decimals, optional trailing ')' or '%'. Deliberately does NOT
// require a currency symbol — most rows in these PDFs are bare numbers
// under a currency/unit heading stated once above the table (§35).
const NUMERIC_TOKEN = /^\(?-?\d[\d,]*(\.\d+)?\)?%?$/;
const MIN_ROWS_TO_COUNT_AS_TABLE = 2;
// A run of 3+ dots/periods (with optional spaces between) is the classic
// "leader" pattern in a table of contents ("1.4.1 PURPOSE .......... 5")
// — that shape otherwise matches the row heuristic perfectly (label +
// trailing small number), so it must be excluded explicitly. Caught by
// testing against a real NSE strategy document with a TOC page.
const TOC_LEADER = /(\.\s*){3,}/;
function parseRowCandidate(line) {
    if (TOC_LEADER.test(line))
        return null;
    const tokens = line.trim().split(/\s+/);
    if (tokens.length < 2)
        return null;
    // Peel numeric tokens off the end; everything before them is the label.
    let splitIndex = tokens.length;
    for (let i = tokens.length - 1; i >= 0; i--) {
        if (NUMERIC_TOKEN.test(tokens[i])) {
            splitIndex = i;
        }
        else {
            break;
        }
    }
    const values = tokens.slice(splitIndex);
    const labelTokens = tokens.slice(0, splitIndex);
    if (values.length === 0 || labelTokens.length === 0)
        return null;
    // A genuine row label shouldn't itself contain numeric-looking tokens
    // (e.g. a bare year). If it does, this is more likely a header line
    // that happens to end in something matching NUMERIC_TOKEN (like a unit
    // label "(KES 000)") than an actual data row.
    if (labelTokens.some((t) => NUMERIC_TOKEN.test(t)))
        return null;
    return { label: labelTokens.join(" "), values };
}
export function extractTablesFromText(text) {
    const lines = text.split("\n").map((l) => l.trim());
    const tables = [];
    let currentRows = [];
    let blockStartIndex = -1;
    const flush = (endIndex) => {
        if (currentRows.length >= MIN_ROWS_TO_COUNT_AS_TABLE) {
            const precedingLine = blockStartIndex > 0 ? lines[blockStartIndex - 1] : "";
            const isPrecedingLineARow = precedingLine ? parseRowCandidate(precedingLine) !== null : true;
            const headerLine = precedingLine && !isPrecedingLineARow ? precedingLine : null;
            // Title: look a bit further up for a heading-like line (short,
            // no numbers, not immediately adjacent) — best-effort only.
            let title = null;
            for (let i = blockStartIndex - 1; i >= Math.max(0, blockStartIndex - 4); i--) {
                const candidate = lines[i];
                if (!candidate)
                    continue;
                if (parseRowCandidate(candidate))
                    break; // hit another table's row, stop
                if (/[A-Z]{4,}/.test(candidate) && candidate.length < 120) {
                    title = candidate;
                    break;
                }
            }
            // Confidence scales with row count and column consistency —
            // capped conservatively since this is a text heuristic, not a
            // verified structural parse.
            const columnCounts = new Set(currentRows.map((r) => r.values.length));
            const consistentColumns = columnCounts.size === 1;
            const confidence = Math.min(0.85, (consistentColumns ? 0.5 : 0.3) + currentRows.length * 0.03);
            tables.push({ title, headerLine, rows: currentRows, method: "line_heuristic_v1", confidence });
        }
        currentRows = [];
        blockStartIndex = -1;
    };
    lines.forEach((line, index) => {
        const row = parseRowCandidate(line);
        if (row) {
            if (currentRows.length === 0)
                blockStartIndex = index;
            currentRows.push(row);
        }
        else {
            flush(index);
        }
    });
    flush(lines.length);
    return tables;
}
