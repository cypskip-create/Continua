import { pool, query } from "../src/storage/db.js";
try {
  const reports = {
    downloads: await query("SELECT source_id,status,count(*)::int AS count FROM scraping.document_jobs GROUP BY source_id,status ORDER BY source_id,status"),
    archiveYears: await query("SELECT archive_url,archive_year,cardinality(pages) AS discovered_pages,cardinality(completed_pages) AS completed_pages FROM scraping.archive_checkpoints ORDER BY archive_url,archive_year"),
    reviews: await query("SELECT source,status,count(*)::int AS count FROM market.financial_statement_candidates GROUP BY source,status ORDER BY source,status"),
    financialPeriods: await query(`SELECT s.symbol,p.fiscal_year,p.period_type,count(i.period_id)::int AS income,count(b.period_id)::int AS balance,count(c.period_id)::int AS cashflow FROM market.financial_periods p JOIN market.securities s ON s.id=p.security_id LEFT JOIN market.income_statements i ON i.period_id=p.id LEFT JOIN market.balance_sheets b ON b.period_id=p.id LEFT JOIN market.cash_flow_statements c ON c.period_id=p.id WHERE p.fiscal_year>=2015 GROUP BY s.symbol,p.fiscal_year,p.period_type ORDER BY s.symbol,p.fiscal_year`),
  };
  console.log(JSON.stringify(Object.fromEntries(Object.entries(reports).map(([key,result])=>[key,result.rows])),null,2));
} catch (error) { console.error(JSON.stringify({ errorCode:(error as {code?:string}).code ?? "coverage_failed" })); process.exitCode=1; }
finally { await pool.end(); }
