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

export const REVIEW_ME = "REVIEW_ME";

export const FIELD_KEYWORDS: Record<"income" | "balance" | "cashflow", Record<string, string[]>> = {
  income: {
    revenue: ["revenue", "turnover", "total income", "net sales"],
    costOfRevenue: ["cost of revenue", "cost of sales"],
    grossProfit: ["gross profit"],
    operatingExpenses: ["operating expense"],
    operatingIncome: ["operating income", "operating profit"],
    netIncome: ["net income", "net profit", "profit for the year", "profit after tax"],
    eps: ["earnings per share", "eps"],
    dilutedEps: ["diluted earnings per share", "diluted eps"],
    ebitda: ["ebitda"],
  },
  balance: {
    totalAssets: ["total assets"],
    totalLiabilities: ["total liabilities"],
    totalEquity: ["total equity", "shareholders' equity", "shareholders equity"],
    cash: ["cash and cash equivalents", "cash and bank"],
    totalDebt: ["total debt", "borrowings"],
    currentAssets: ["current assets"],
    currentLiabilities: ["current liabilities"],
    sharesOutstanding: ["shares outstanding", "issued shares"],
  },
  cashflow: {
    operatingCashFlow: ["cash flow from operating", "net cash from operating", "operating activities"],
    investingCashFlow: ["cash flow from investing", "investing activities"],
    financingCashFlow: ["cash flow from financing", "financing activities"],
    freeCashFlow: ["free cash flow"],
    capex: ["capital expenditure", "purchase of property"],
  },
};

function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Scores each statement type by how many detected labels match its
 *  keyword set — the type with the most hits wins. Ties/no-hits fall
 *  back to "income" (the most common case) but the caller must still
 *  treat this as a guess, not a fact. */
export function guessStatementType(rows: DetectedTableRow[]): "income" | "balance" | "cashflow" {
  const scores: Record<"income" | "balance" | "cashflow", number> = { income: 0, balance: 0, cashflow: 0 };
  for (const row of rows) {
    const label = normalizeLabel(row.label);
    for (const type of Object.keys(FIELD_KEYWORDS) as (keyof typeof FIELD_KEYWORDS)[]) {
      for (const keywords of Object.values(FIELD_KEYWORDS[type])) {
        if (keywords.some((kw) => label.includes(kw))) scores[type]++;
      }
    }
  }
  const best = (Object.entries(scores) as [keyof typeof scores, number][]).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : "income";
}

/** "(1,234.5)" → -1234.5, "1,234.5" → 1234.5, "—"/"-"/"" → null. */
export function parseNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "—" || trimmed === "-") return null;
  const negative = /^\(.*\)$/.test(trimmed);
  const cleaned = trimmed.replace(/[(),]/g, "").replace(/,/g, "");
  const value = parseFloat(cleaned);
  if (Number.isNaN(value)) return null;
  return negative ? -Math.abs(value) : value;
}

export function guessFiscalYear(...texts: (string | null)[]): number | null {
  for (const text of texts) {
    if (!text) continue;
    const match = text.match(/\b(20\d{2})\b/);
    if (match) return parseInt(match[1]!, 10);
  }
  return null;
}

export function mapRowsToFields(
  rows: DetectedTableRow[],
  statementType: "income" | "balance" | "cashflow",
): { mapped: Record<string, number | null>; unmapped: DetectedTableRow[] } {
  const mapped: Record<string, number | null> = {};
  const unmapped: DetectedTableRow[] = [];
  const keywordMap = FIELD_KEYWORDS[statementType];

  for (const row of rows) {
    const label = normalizeLabel(row.label);
    let matchedField: string | null = null;
    for (const [field, keywords] of Object.entries(keywordMap)) {
      if (keywords.some((kw) => label.includes(kw))) {
        matchedField = field;
        break;
      }
    }
    if (matchedField) {
      mapped[matchedField] = parseNumber(row.values[0]);
    } else {
      unmapped.push(row);
    }
  }
  return { mapped, unmapped };
}