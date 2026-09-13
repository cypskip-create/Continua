/**
 * HTTP equivalent of the financials:review / financials:draft /
 * financials:confirm / financials:reject CLI scripts, for review without
 * shell access (see requireAdminKey.ts for the auth model). Same rules,
 * same repository calls, same normalization — this is a different way to
 * drive the exact same workflow, not a looser one. Nothing here guesses a
 * number that ends up written to the database; guessStatementType/
 * mapRowsToFields only produce a pre-filled suggestion for a human to
 * approve or correct in the request body, exactly like the CLI's draft
 * step produces a file for a human to hand-edit.
 */
import type { Request, Response } from "express";
import { z } from "zod";
import { financialStatementCandidatesRepository } from "../../storage/repositories/financialStatementCandidatesRepository.js";
import { financialsRepository } from "../../storage/repositories/financialsRepository.js";
import { securitiesRepository } from "../../storage/repositories/securitiesRepository.js";
import { normalizeIncomeStatement, normalizeCashFlow, checkBalanceSheetIntegrity } from "../../normalization/financials/normalizeFinancials.js";
import { guessStatementType, mapRowsToFields, guessFiscalYear } from "../../ingestion/financialsDraft.js";
import { ApiError } from "../middleware/errorHandler.js";

function periodId(securityId: string, fiscalYear: number, fiscalQuarter?: number | null): string {
  const [exchange, symbol] = securityId.split(":");
  return `${exchange}:period:${symbol}:${fiscalYear}${fiscalQuarter ? `Q${fiscalQuarter}` : ""}`;
}

const ConfirmBodySchema = z.object({
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

const RejectBodySchema = z.object({ note: z.string().optional() });

export const adminFinancialsController = {
  /** GET /admin/financials/candidates?limit=50 — same rows as `npm run financials:review`. */
  async listPending(req: Request, res: Response) {
    const limit = req.query.limit ? Number(req.query.limit) : 100;
    const candidates = await financialStatementCandidatesRepository.listPending(limit);
    res.json({ data: candidates });
  },

  /** GET /admin/financials/candidates/:id — the candidate PLUS a pre-filled
   *  guess (same logic as `financials:draft`), so the review page can show
   *  a form already populated instead of a human typing every field. */
  async getOne(req: Request, res: Response) {
    const candidate = await financialStatementCandidatesRepository.getById(req.params.id!);
    if (!candidate) throw new ApiError(404, `No candidate ${req.params.id}`);

    const rows = candidate.detectedTable.rows;
    const statementType = guessStatementType(rows);
    const { mapped, unmapped } = mapRowsToFields(rows, statementType);
    const fiscalYear = guessFiscalYear(candidate.documentTitle, candidate.detectedTable.title, candidate.detectedTable.headerLine);

    res.json({
      data: candidate,
      draft: {
        statementType,
        fiscalYear,
        mapped,
        unmapped,
      },
    });
  },

  /** GET /admin/securities?exchange=NSE — for the picker shown when a
   *  candidate has no resolved securityId. */
  async listSecurities(req: Request, res: Response) {
    const exchange = (req.query.exchange as string) || "NSE";
    const securities = await securitiesRepository.listByExchange(exchange);
    res.json({ data: securities });
  },

  /** POST /admin/financials/candidates/:id/confirm — same write path as
   *  `npm run financials:confirm`, driven by a request body instead of a
   *  JSON file. */
  async confirm(req: Request, res: Response) {
    const candidateId = req.params.id!;
    const input = ConfirmBodySchema.parse(req.body);

    const candidate = await financialStatementCandidatesRepository.getById(candidateId);
    if (!candidate) throw new ApiError(404, `No candidate ${candidateId}`);
    if (candidate.status !== "pending") {
      throw new ApiError(409, `Candidate ${candidateId} is already '${candidate.status}' — refusing to overwrite.`);
    }

    const securityId = input.securityId ?? candidate.securityId;
    if (!securityId) {
      throw new ApiError(422, `Candidate ${candidateId} has no resolved securityId — supply one in the request body.`);
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

    let balanceWarning: string | null = null;

    if (input.statementType === "income") {
      if (!input.income) throw new ApiError(422, `statementType is "income" but no "income" block was given.`);
      await financialsRepository.upsertIncomeStatement(normalizeIncomeStatement({ periodId: pId, ...input.income }));
    } else if (input.statementType === "balance") {
      if (!input.balance) throw new ApiError(422, `statementType is "balance" but no "balance" block was given.`);
      const integrity = checkBalanceSheetIntegrity({ periodId: pId, ...input.balance });
      if (!integrity.ok) {
        balanceWarning = `Balance sheet doesn't balance within tolerance (assets vs. liabilities+equity off by ${integrity.deltaPercent}%). Written anyway — double-check the source figures.`;
      }
      await financialsRepository.upsertBalanceSheet({ periodId: pId, ...input.balance });
    } else {
      if (!input.cashflow) throw new ApiError(422, `statementType is "cashflow" but no "cashflow" block was given.`);
      await financialsRepository.upsertCashFlowStatement(normalizeCashFlow({ periodId: pId, ...input.cashflow }));
    }

    await financialStatementCandidatesRepository.markReviewed(candidateId, "confirmed", input.note ?? null, pId);

    res.json({ data: { candidateId, periodId: pId, securityId, warning: balanceWarning } });
  },

  /** POST /admin/financials/candidates/:id/reject — same as `financials:reject`. */
  async reject(req: Request, res: Response) {
    const candidateId = req.params.id!;
    const { note } = RejectBodySchema.parse(req.body ?? {});

    const candidate = await financialStatementCandidatesRepository.getById(candidateId);
    if (!candidate) throw new ApiError(404, `No candidate ${candidateId}`);

    await financialStatementCandidatesRepository.markReviewed(candidateId, "rejected", note ?? null, null);
    res.json({ data: { candidateId, status: "rejected" } });
  },
};