import { z } from "zod";
import { withTransaction } from "../storage/db.js";
import { ApiError } from "../api/middleware/errorHandler.js";
import { checkBalanceSheetIntegrity } from "../normalization/financials/normalizeFinancials.js";

const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v);
const amount=z.number().finite();
const income=z.object({revenue:amount,netIncome:amount,eps:amount,costOfRevenue:amount.optional(),grossProfit:amount.optional(),operatingExpenses:amount.optional(),operatingIncome:amount.optional(),dilutedEps:amount.optional(),ebitda:amount.optional()});
const balance=z.object({totalAssets:amount,totalLiabilities:amount,totalEquity:amount,cash:amount.optional(),totalDebt:amount.optional(),currentAssets:amount.optional(),currentLiabilities:amount.optional(),sharesOutstanding:amount.optional()});
const cashflow=z.object({operatingCashFlow:amount.optional(),investingCashFlow:amount.optional(),financingCashFlow:amount.optional(),freeCashFlow:amount.optional(),capex:amount.optional()});
export const HistoricalConfirmSchema=z.object({
  securityId:z.string().regex(/^NSE:[A-Z0-9.\-]+$/).optional(),
  statementType:z.enum(["income","balance","cashflow"]),
  unitsVerified:z.literal(true),
  periods:z.array(z.object({
    columnIndex:z.number().int().min(0).max(19),
    period:z.object({periodType:z.enum(["annual","quarterly"]),fiscalYear:z.number().int().min(1900).max(2100),fiscalQuarter:z.number().int().min(1).max(4).nullable().optional(),periodEnd:date,reportedAt:date,currency:z.literal("KES")}),
    income:income.optional(),balance:balance.optional(),cashflow:cashflow.optional(),
    sourcePage:z.number().int().min(1),note:z.string().trim().min(10).max(2000),allowRestatement:z.boolean().default(false),
  })).min(1).max(20),
}).superRefine((b,ctx)=>{
  const columns=new Set<number>(),periods=new Set<string>();
  for(const e of b.periods){
    const key=`${e.period.periodType}:${e.period.fiscalYear}:${e.period.fiscalQuarter??0}`;
    const reject=(message:string)=>ctx.addIssue({code:'custom',message});
    if(columns.has(e.columnIndex)||periods.has(key))reject('Source columns and reporting periods must be unique');
    columns.add(e.columnIndex);periods.add(key);
    if(e.period.periodType==='quarterly'&&!e.period.fiscalQuarter)reject('Quarterly data needs a fiscal quarter');
    if(e.period.periodType==='annual'&&e.period.fiscalQuarter)reject('Annual data must not have a quarter');
    if(e.period.reportedAt<e.period.periodEnd||e.period.reportedAt>new Date().toISOString().slice(0,10))reject('Reported date must be between period end and today');
    if(!e[b.statementType])reject('Include reviewed statement values for every period');
    if(b.statementType==='cashflow'&&!Object.values(e.cashflow??{}).some(v=>v!=null))reject('Include at least one reported cash-flow value');
    if(e.balance&&!checkBalanceSheetIntegrity({periodId:'review',...e.balance}).ok)reject('Balance sheet does not balance. Recheck the source and units');
  }
});
const fields={
  income:{revenue:'revenue',netIncome:'net_income',eps:'eps',costOfRevenue:'cost_of_revenue',grossProfit:'gross_profit',operatingExpenses:'operating_expenses',operatingIncome:'operating_income',dilutedEps:'diluted_eps',ebitda:'ebitda'},
  balance:{totalAssets:'total_assets',totalLiabilities:'total_liabilities',totalEquity:'total_equity',cash:'cash',totalDebt:'total_debt',currentAssets:'current_assets',currentLiabilities:'current_liabilities',sharesOutstanding:'shares_outstanding'},
  cashflow:{operatingCashFlow:'operating_cash_flow',investingCashFlow:'investing_cash_flow',financingCashFlow:'financing_cash_flow',freeCashFlow:'free_cash_flow',capex:'capex'},
};
const tables={income:'income_statements',balance:'balance_sheets',cashflow:'cash_flow_statements'};
/** Publish explicitly reviewed base-unit columns together, or none of them. */
export async function confirmHistoricalColumns(candidateId:string,raw:unknown) {
  const b=HistoricalConfirmSchema.parse(raw);
  return withTransaction(async client=>{
    const c=(await client.query('SELECT * FROM market.financial_statement_candidates WHERE id=$1 FOR UPDATE',[candidateId])).rows[0];
    if(!c)throw new ApiError(404,'Filing candidate not found');
    if(c.status==='rejected')throw new ApiError(409,'This candidate was rejected');
    const securityId=b.securityId??c.security_id;
    const security=(await client.query("SELECT symbol FROM market.securities WHERE id=$1 AND exchange='NSE' AND status <> 'delisted'",[securityId])).rows[0];
    if(!security)throw new ApiError(422,'Choose a covered NSE security');
    const columnCount=Math.max(0,...(c.detected_table?.rows??[]).map((r:{values:string[]})=>r.values.length));
    const ids:string[]=[];
    for(const e of [...b.periods].sort((a,b)=>a.period.fiscalYear-b.period.fiscalYear||(a.period.fiscalQuarter??0)-(b.period.fiscalQuarter??0))){
      if(e.columnIndex>=columnCount)throw new ApiError(422,'Column is not present in the source table');
      const p=e.period,id=`NSE:period:${security.symbol}:${p.fiscalYear}${p.fiscalQuarter?`Q${p.fiscalQuarter}`:''}`;
      // Different candidate rows can target the same previously absent period.
      // Serialize that period before checking for an existing statement.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[id]);
      const existing=(await client.query(`SELECT p.*,row_to_json(s) AS statement FROM market.financial_periods p LEFT JOIN market.${tables[b.statementType]} s ON s.period_id=p.id WHERE p.id=$1 FOR UPDATE OF p`,[id])).rows[0];
      if(existing&&(existing.period_type!==p.periodType||String(existing.period_end).slice(0,10)!==p.periodEnd||existing.currency!==p.currency))throw new ApiError(409,'Existing period dates or currency differ. Resolve them before publishing');
      if(existing?.statement&&!e.allowRestatement)throw new ApiError(409,'This statement exists. Explicitly review it as a restatement to replace it');
      if(existing?.reported_at&&String(existing.reported_at).slice(0,10)>p.reportedAt)throw new ApiError(409,'An older filing cannot replace a newer reported period');
      await client.query(`INSERT INTO market.financial_periods(id,security_id,period_type,fiscal_year,fiscal_quarter,period_end,reported_at,currency) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET reported_at=EXCLUDED.reported_at`,[id,securityId,p.periodType,p.fiscalYear,p.fiscalQuarter??null,p.periodEnd,p.reportedAt,p.currency]);
      const input=e[b.statementType] as Record<string,number>;
      const keys=Object.keys(input).filter(k=>Object.hasOwn(fields[b.statementType],k));
      const names=keys.map(k=>(fields[b.statementType] as Record<string,string>)[k]);
      await client.query(`INSERT INTO market.${tables[b.statementType]}(period_id,${names.join(',')}) VALUES($1,${keys.map((_,i)=>'$'+(i+2)).join(',')}) ON CONFLICT(period_id) DO UPDATE SET ${names.map(n=>`${n}=EXCLUDED.${n}`).join(',')}`,[id,...keys.map(k=>input[k])]);
      await client.query(`INSERT INTO market.filing_history_reviews(candidate_id,period_id,column_index,statement_type,source_url,source_page,review_note,reviewed_values,previous_values) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[candidateId,id,e.columnIndex,b.statementType,c.document_url,e.sourcePage,e.note,JSON.stringify(input),JSON.stringify(existing?.statement??null)]);
      ids.push(id);
    }
    await client.query("UPDATE market.financial_statement_candidates SET status='confirmed',reviewed_at=now(),reviewed_note=$2,resulting_period_id=$3,updated_at=now() WHERE id=$1",[candidateId,`Historical columns reviewed: ${b.periods.map(p=>p.columnIndex).join(', ')}`,ids.at(-1)]);
    return {candidateId,periodIds:ids,sourceUrl:c.document_url};
  });
}
