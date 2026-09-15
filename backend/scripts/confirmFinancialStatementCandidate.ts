/**
 * CLI: confirm a reviewed financial statement candidate and write it into
 * market.financial_periods + the one real statement table it represents.
 *   npm run financials:confirm -- ./review/candidate-42.json
 *
 * Takes a JSON FILE path (not inline JSON on the command line) — inline
 * JSON args get mangled by PowerShell's quoting rules, so a file avoids
 * that entirely. Nothing here guesses: every field below is something
 * YOU decide by reading the source document (linked in the candidate's
 * documentUrl / printed by `npm run financials:review`), not something
 * inferred from the detected table automatically.
 *
 * File format:
 * {
 *   "candidateId": "42",
 *   "securityId": "NSE:SCOM",              // required if the candidate's own entity resolution came back unresolved
 *   "statementType": "income",              
 *   "period": {
 *     "periodType": "annual",               // "annual" | "quarterly"
 *     "fiscalYear": 2025,
 *     "fiscalQuarter": null,                // 1-4, required if periodType is "quarterly"
 *     "periodEnd": "2025-12-31",
 *     "reportedAt": "2026-03-02",
 *     "currency": "KES"
 *   },
 *   "income":   { "revenue": 359433000, "netIncome": 51737000, "eps": 12.87 },   // if statementType is "income"
 *   "balance":  { "totalAssets": 1, "totalLiabilities": 1, "totalEquity": 1 },   // if statementType is "balance"
 *   "cashflow": { "operatingCashFlow": 1 },                                      // if statementType is "cashflow"
 *   "note": "Confirmed against FY2025 annual report, page 42"
 * }
 *
 * Run it again with a different statementType (same candidateId is fine —
 * financial_periods/income_statements/etc. all upsert on their own keys)
 * to record more than one statement off the same source document; each
 * detected table from the scraper is its own candidate row already, so
 * normally you'll run this once per candidate.
 */
import { readFileSync } from "node:fs";
import { z } from "zod";
import { financialStatementCandidatesRepository } from "../src/storage/repositories/financialStatementCandidatesRepository.js";
import { financialsRepository } from "../src/storage/repositories/financialsRepository.js";
import { normalizeIncomeStatement, normalizeCashFlow, checkBalanceSheetIntegrity } from "../src/normalization/financials/normalizeFinancials.js";
import { pool } from "../src/storage/db.js";

const ConfirmSchema = z.object({
  candidateId: z.string(),
  securityId: z.string().optional(),
  statementType: z.enum(["income", "balance", "cashflow"]),
  period: z.object({
    periodType: z.enum(["annual", "quarterly"]),
    fiscalYear: z.number().int(),
    fiscalQuarter: z.number().int().min(1).max(4).nullable().optional(),
    periodEnd: z.string(),
    reportedAt: z.string(),
    currency: z.string(),
  }),
  income: z.object({
    revenue: z.number(), costOfRevenue: z.number().optional(), grossProfit: z.number().optional(),
    operatingExpenses: z.number().optional(), operatingIncome: z.number().optional(),
    netIncome: z.number(), eps: z.number(), dilutedEps: z.number().optional(), ebitda: z.number().optional(),
  }).optional(),
  balance: z.object({
    totalAssets: z.number(), totalLiabilities: z.number(), totalEquity: z.number(),
    cash: z.number().optional(), totalDebt: z.number().optional(),
    currentAssets: z.number().optional(), currentLiabilities: z.number().optional(), sharesOutstanding: z.number().optional(),
  }).optional(),
  cashflow: z.object({
    operatingCashFlow: z.number().optional(), investingCashFlow: z.number().optional(),
    financingCashFlow: z.number().optional(), freeCashFlow: z.number().optional(), capex: z.number().optional(),
  }).optional(),
  note: z.string().optional(),
});

/** Same id shape nseMapper.ts uses (`${exchange}:period:${symbol}:${fy}Q?`)
 *  so a confirmed candidate lands on the exact same period row as any
 *  price/index adapter data for that security-year, instead of creating a
 *  parallel, disconnected one. */
function periodId(securityId: string, fiscalYear: number, fiscalQuarter?: number | null): string {
  const [exchange, symbol] = securityId.split(":");
  return `${exchange}:period:${symbol}:${fiscalYear}${fiscalQuarter ? `Q${fiscalQuarter}` : ""}`;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: npm run financials:confirm -- ./path/to/candidate.json");
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(filePath, "utf-8"));
  const input = ConfirmSchema.parse(raw);

  const candidate = await financialStatementCandidatesRepository.getById(input.candidateId);
  if (!candidate) throw new Error(`No candidate with id ${input.candidateId}`);
  if (candidate.status !== "pending") {
    console.error(`Candidate ${input.candidateId} is already '${candidate.status}' — refusing to overwrite. Nothing done.`);
    await pool.end();
    return;
  }

  const securityId = input.securityId ?? candidate.securityId;
  if (!securityId) {
    throw new Error(
      `Candidate ${input.candidateId} has no resolved securityId (raw name was "${candidate.rawCompanyName}") — ` +
      `supply one explicitly in the "securityId" field of the confirm file.`
    );
  }

  const pId = periodId(securityId, input.period.fiscalYear, input.period.fiscalQuarter ?? undefined);

  await financialsRepository.upsertPeriod({
    id: pId,
    securityId,
    periodType: input.period.periodType,
    fiscalYear: input.period.fiscalYear,
    fiscalQuarter: input.period.fiscalQuarter ?? undefined,
    periodEnd: input.period.periodEnd,
    reportedAt: input.period.reportedAt,
    currency: input.period.currency as any,
  });

  if (input.statementType === "income") {
    if (!input.income) throw new Error(`statementType is "income" but no "income" block was given.`);
    await financialsRepository.upsertIncomeStatement(normalizeIncomeStatement({ periodId: pId, ...input.income }));
  } else if (input.statementType === "balance") {
    if (!input.balance) throw new Error(`statementType is "balance" but no "balance" block was given.`);
    const integrity = checkBalanceSheetIntegrity({ periodId: pId, ...input.balance });
    if (!integrity.ok) {
      console.warn(
        `⚠ Balance sheet doesn't balance within tolerance (assets vs. liabilities+equity off by ${integrity.deltaPercent}%). ` +
        `Writing it anyway — double-check the source figures before trusting this period.`
      );
    }
    await financialsRepository.upsertBalanceSheet({ periodId: pId, ...input.balance });
  } else {
    if (!input.cashflow) throw new Error(`statementType is "cashflow" but no "cashflow" block was given.`);
    await financialsRepository.upsertCashFlowStatement(normalizeCashFlow({ periodId: pId, ...input.cashflow }));
  }

  await financialStatementCandidatesRepository.markReviewed(input.candidateId, "confirmed", input.note ?? null, pId);

  console.log(`Confirmed candidate ${input.candidateId} → ${input.statementType} statement for ${securityId}, period ${pId}.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});