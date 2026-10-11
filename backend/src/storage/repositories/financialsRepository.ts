import { query } from "../db.js";
import type { FinancialPeriod, IncomeStatement, BalanceSheet, CashFlowStatement } from "../../types/market.js";
import {env} from '../../config/index.js';

export const financialsRepository = {
  async upsertPeriod(period: FinancialPeriod): Promise<void> {
    await query(
      `INSERT INTO market.financial_periods (id, security_id, period_type, fiscal_year, fiscal_quarter, period_end, reported_at, currency)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET reported_at = EXCLUDED.reported_at`,
      [period.id, period.securityId, period.periodType, period.fiscalYear, period.fiscalQuarter ?? null, period.periodEnd, period.reportedAt, period.currency]
    );
  },

  async upsertIncomeStatement(income: IncomeStatement): Promise<void> {
    await query(
      `INSERT INTO market.income_statements (period_id, revenue, cost_of_revenue, gross_profit, operating_expenses, operating_income, net_income, eps, diluted_eps, ebitda)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (period_id) DO UPDATE SET
         revenue=EXCLUDED.revenue, cost_of_revenue=EXCLUDED.cost_of_revenue, gross_profit=EXCLUDED.gross_profit,
         operating_expenses=EXCLUDED.operating_expenses, operating_income=EXCLUDED.operating_income,
         net_income=EXCLUDED.net_income, eps=EXCLUDED.eps, diluted_eps=EXCLUDED.diluted_eps, ebitda=EXCLUDED.ebitda`,
      [income.periodId, income.revenue, income.costOfRevenue ?? null, income.grossProfit ?? null, income.operatingExpenses ?? null,
       income.operatingIncome ?? null, income.netIncome, income.eps, income.dilutedEps ?? null, income.ebitda ?? null]
    );
  },

  async upsertBalanceSheet(balance: BalanceSheet): Promise<void> {
    await query(
      `INSERT INTO market.balance_sheets (period_id, total_assets, total_liabilities, total_equity, cash, total_debt, current_assets, current_liabilities, shares_outstanding)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (period_id) DO UPDATE SET
         total_assets=EXCLUDED.total_assets, total_liabilities=EXCLUDED.total_liabilities, total_equity=EXCLUDED.total_equity,
         cash=EXCLUDED.cash, total_debt=EXCLUDED.total_debt, current_assets=EXCLUDED.current_assets,
         current_liabilities=EXCLUDED.current_liabilities, shares_outstanding=EXCLUDED.shares_outstanding`,
      [balance.periodId, balance.totalAssets, balance.totalLiabilities, balance.totalEquity, balance.cash ?? null,
       balance.totalDebt ?? null, balance.currentAssets ?? null, balance.currentLiabilities ?? null, balance.sharesOutstanding ?? null]
    );
  },

  async upsertCashFlowStatement(cashFlow: CashFlowStatement): Promise<void> {
    await query(
      `INSERT INTO market.cash_flow_statements (period_id, operating_cash_flow, investing_cash_flow, financing_cash_flow, free_cash_flow, capex)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (period_id) DO UPDATE SET
         operating_cash_flow=EXCLUDED.operating_cash_flow, investing_cash_flow=EXCLUDED.investing_cash_flow,
         financing_cash_flow=EXCLUDED.financing_cash_flow, free_cash_flow=EXCLUDED.free_cash_flow, capex=EXCLUDED.capex`,
      [cashFlow.periodId, cashFlow.operatingCashFlow ?? null, cashFlow.investingCashFlow ?? null, cashFlow.financingCashFlow ?? null,
       cashFlow.freeCashFlow ?? null, cashFlow.capex ?? null]
    );
  },

  /** NSE research data. Coverage depends on the available sources; missing values remain unavailable. */
  async upsertPeriodBundle(period: FinancialPeriod, income: IncomeStatement, balance: BalanceSheet, cashFlow: CashFlowStatement): Promise<void> {
    await this.upsertPeriod(period);
    await this.upsertIncomeStatement(income);
    await this.upsertBalanceSheet(balance);
    await this.upsertCashFlowStatement(cashFlow);
  },

  async getLatestPeriodBundle(securityId: string, periodType: "annual" | "quarterly" = "annual") {
    const res = await query<any>(
      `SELECT p.id as "periodId", p.security_id as "securityId", p.period_type as "periodType", p.fiscal_year as "fiscalYear",
              p.fiscal_quarter as "fiscalQuarter", p.period_end as "periodEnd", p.reported_at as "reportedAt", p.currency,
              i.revenue, i.net_income as "netIncome", i.eps, i.ebitda, i.gross_profit as "grossProfit", i.operating_income as "operatingIncome",
              b.total_assets as "totalAssets", b.total_liabilities as "totalLiabilities", b.total_equity as "totalEquity",
              b.cash, b.total_debt as "totalDebt", b.current_assets as "currentAssets", b.current_liabilities as "currentLiabilities",
              b.shares_outstanding as "sharesOutstanding",
              c.operating_cash_flow as "operatingCashFlow", c.free_cash_flow as "freeCashFlow"
       FROM market.financial_periods p
       LEFT JOIN market.income_statements i ON i.period_id = p.id
       LEFT JOIN market.balance_sheets b ON b.period_id = p.id
       LEFT JOIN market.cash_flow_statements c ON c.period_id = p.id
       WHERE p.security_id = $1 AND p.period_type = $2
         AND p.period_end <= CURRENT_DATE AND p.reported_at <= CURRENT_DATE
         AND ($3 OR EXISTS(SELECT 1 FROM market.filing_history_reviews reviewed WHERE reviewed.period_id=p.id))
         AND (i.period_id IS NOT NULL OR b.period_id IS NOT NULL OR c.period_id IS NOT NULL)
       ORDER BY p.fiscal_year DESC, p.fiscal_quarter DESC NULLS FIRST
       LIMIT 1`,
      [securityId, periodType,env.NODE_ENV!=='production']
    );
    return res.rows[0] ?? null;
  },

  async getHistoricalPeriods(securityId: string, periodType: "annual" | "quarterly", limit = 5) {
    const res = await query<any>(
      `SELECT p.fiscal_year as "fiscalYear", p.fiscal_quarter as "fiscalQuarter",
              p.period_end as "periodEnd", p.reported_at as "reportedAt", p.currency,
              i.revenue, i.net_income as "netIncome", i.eps,
              i.gross_profit as "grossProfit", i.operating_income as "operatingIncome", i.ebitda,
              i.cost_of_revenue as "costOfRevenue", i.operating_expenses as "operatingExpenses",
              b.total_assets as "totalAssets", b.total_liabilities as "totalLiabilities",
              b.total_equity as "totalEquity", b.cash, b.total_debt as "totalDebt",
              b.current_assets as "currentAssets", b.current_liabilities as "currentLiabilities",
              b.shares_outstanding as "sharesOutstanding",
              c.operating_cash_flow as "operatingCashFlow", c.investing_cash_flow as "investingCashFlow",
              c.financing_cash_flow as "financingCashFlow", c.free_cash_flow as "freeCashFlow", c.capex,
              (SELECT array_agg(DISTINCT r.source_url) FROM market.filing_history_reviews r WHERE r.period_id=p.id) AS "sourceUrls"
       FROM market.financial_periods p LEFT JOIN market.income_statements i ON i.period_id = p.id
       LEFT JOIN market.balance_sheets b ON b.period_id = p.id
       LEFT JOIN market.cash_flow_statements c ON c.period_id = p.id
       WHERE p.security_id = $1 AND p.period_type = $2
         AND p.period_end <= CURRENT_DATE AND p.reported_at <= CURRENT_DATE
         AND ($4 OR EXISTS(SELECT 1 FROM market.filing_history_reviews reviewed WHERE reviewed.period_id=p.id))
         AND (i.period_id IS NOT NULL OR b.period_id IS NOT NULL OR c.period_id IS NOT NULL)
       ORDER BY p.fiscal_year DESC, p.fiscal_quarter DESC NULLS FIRST LIMIT $3`,
      [securityId, periodType, limit,env.NODE_ENV!=='production']
    );
    return res.rows.reverse();
  },
};
