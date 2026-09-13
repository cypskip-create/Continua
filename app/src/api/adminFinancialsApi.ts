import { adminFetch } from "./adminClient";
import type { FinancialStatementCandidate, Security } from "./types";

export interface CandidateDraft {
  statementType: "income" | "balance" | "cashflow";
  fiscalYear: number | null;
  mapped: Record<string, number | null>;
  unmapped: { label: string; values: string[] }[];
}

export interface ConfirmPayload {
  securityId?: string;
  statementType: "income" | "balance" | "cashflow";
  period: {
    periodType: "annual" | "quarterly";
    fiscalYear: number;
    fiscalQuarter?: number | null;
    periodEnd: string;
    reportedAt: string;
    currency: string;
  };
  income?: Record<string, number>;
  balance?: Record<string, number>;
  cashflow?: Record<string, number>;
  note?: string;
}

export const adminFinancialsApi = {
  listPending: (limit = 100) =>
    adminFetch<{ data: FinancialStatementCandidate[] }>("/financials/candidates", { params: { limit } }).then((r) => r.data),

  getOne: (id: string) =>
    adminFetch<{ data: FinancialStatementCandidate; draft: CandidateDraft }>(`/financials/candidates/${id}`),

  confirm: (id: string, payload: ConfirmPayload) =>
    adminFetch<{ data: { candidateId: string; periodId: string; securityId: string; warning: string | null } }>(
      `/financials/candidates/${id}/confirm`,
      { method: "POST", body: payload },
    ).then((r) => r.data),

  reject: (id: string, note?: string) =>
    adminFetch<{ data: { candidateId: string; status: string } }>(`/financials/candidates/${id}/reject`, {
      method: "POST",
      body: { note },
    }).then((r) => r.data),

  listSecurities: (exchange = "NSE") =>
    adminFetch<{ data: Security[] }>("/securities", { params: { exchange } }).then((r) => r.data),
};