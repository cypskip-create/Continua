import { query, withTransaction } from "../db.js";
import { env } from '../../config/index.js';
export const financialsRepository = {
    async upsertPeriod(period, db = {query}) {
        await db.query(`INSERT INTO market.financial_periods (id, security_id, period_type, fiscal_year, fiscal_quarter, period_end, reported_at, currency)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET reported_at = EXCLUDED.reported_at`, [period.id, period.securityId, period.periodType, period.fiscalYear, period.fiscalQuarter ?? null, period.periodEnd, period.reportedAt, period.currency]);
    },
    async upsertIncomeStatement(income, db = {query}) {
        await db.query(`INSERT INTO market.income_statements (period_id, revenue, cost_of_revenue, gross_profit, operating_expenses, operating_income, net_income, eps, diluted_eps, ebitda)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (period_id) DO UPDATE SET
         revenue=EXCLUDED.revenue, cost_of_revenue=EXCLUDED.cost_of_revenue, gross_profit=EXCLUDED.gross_profit,
         operating_expenses=EXCLUDED.operating_expenses, operating_income=EXCLUDED.operating_income,
         net_income=EXCLUDED.net_income, eps=EXCLUDED.eps, diluted_eps=EXCLUDED.diluted_eps, ebitda=EXCLUDED.ebitda`, [income.periodId, income.revenue, income.costOfRevenue ?? null, income.grossProfit ?? null, income.operatingExpenses ?? null,
            income.operatingIncome ?? null, income.netIncome, income.eps, income.dilutedEps ?? null, income.ebitda ?? null]);
    },
    async upsertBalanceSheet(balance, db = {query}) {
        await db.query(`INSERT INTO market.balance_sheets (period_id, total_assets, total_liabilities, total_equity, cash, total_debt, current_assets, current_liabilities, shares_outstanding)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (period_id) DO UPDATE SET
         total_assets=EXCLUDED.total_assets, total_liabilities=EXCLUDED.total_liabilities, total_equity=EXCLUDED.total_equity,
         cash=EXCLUDED.cash, total_debt=EXCLUDED.total_debt, current_assets=EXCLUDED.current_assets,
         current_liabilities=EXCLUDED.current_liabilities, shares_outstanding=EXCLUDED.shares_outstanding`, [balance.periodId, balance.totalAssets, balance.totalLiabilities, balance.totalEquity, balance.cash ?? null,
            balance.totalDebt ?? null, balance.currentAssets ?? null, balance.currentLiabilities ?? null, balance.sharesOutstanding ?? null]);
    },
    async upsertCashFlowStatement(cashFlow, db = {query}) {
        await db.query(`INSERT INTO market.cash_flow_statements (period_id, operating_cash_flow, investing_cash_flow, financing_cash_flow, free_cash_flow, capex)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (period_id) DO UPDATE SET
         operating_cash_flow=EXCLUDED.operating_cash_flow, investing_cash_flow=EXCLUDED.investing_cash_flow,
         financing_cash_flow=EXCLUDED.financing_cash_flow, free_cash_flow=EXCLUDED.free_cash_flow, capex=EXCLUDED.capex`, [cashFlow.periodId, cashFlow.operatingCashFlow ?? null, cashFlow.investingCashFlow ?? null, cashFlow.financingCashFlow ?? null,
            cashFlow.freeCashFlow ?? null, cashFlow.capex ?? null]);
    },
    /** NSE research data. Coverage depends on the available sources; missing values remain unavailable. */
    async upsertPeriodBundle(period, income, balance, cashFlow) {
        if ([income,balance,cashFlow].some(component=>component?.periodId!==period.id))
            throw new Error('Financial component period mismatch');
        await withTransaction(async db => {
            await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['canonical-research:'+period.securityId]);
            const reviewed=await db.query('SELECT EXISTS(SELECT 1 FROM market.filing_history_reviews WHERE period_id=$1) AS reviewed',[period.id]);
            if(reviewed.rows[0]?.reviewed)throw new Error('Adapter cannot overwrite reviewed financial statements');
            await this.upsertPeriod(period,db);
            await this.upsertIncomeStatement(income,db);
            await this.upsertBalanceSheet(balance,db);
            await this.upsertCashFlowStatement(cashFlow,db);
        });
    },
    async getLatestPeriodBundle(securityId, periodType = "annual") {
        const rows = await this.getHistoricalPeriods(securityId, periodType, 1);
        return rows.at(-1) ?? null;
    },
    async getHistoricalPeriods(securityId, periodType, limit = 5) {
        if (!['annual', 'quarterly'].includes(periodType) || !Number.isInteger(limit) || limit < 1 || limit > 100)
            throw new Error('Invalid financial history request');
        const res = await query(`SELECT payload FROM market.canonical_financial_history($1,$2,$3,$4) payload`,
            [securityId, periodType, limit, env.NODE_ENV !== 'production']);
        return res.rows.map(row => row.payload);
    },
};
