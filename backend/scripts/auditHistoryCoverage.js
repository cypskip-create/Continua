/** Read-only coverage audit. Never publishes or modifies financial records. */
import 'dotenv/config';
import { query, pool } from '../src/storage/db.js';
try {
    for (const [label, sql] of [
        ['kcbPeriods', `SELECT p.fiscal_year,p.period_end,p.reported_at,i.eps,i.net_income
      FROM market.financial_periods p LEFT JOIN market.income_statements i ON i.period_id=p.id
      WHERE p.security_id='NSE:KCB' AND p.period_type='annual' ORDER BY p.fiscal_year DESC`],
        ['validationCoverage', `SELECT outcome,reason,count(*)::int AS count FROM market.document_validations
      GROUP BY outcome,reason ORDER BY count(*) DESC LIMIT 15`],
        ['queue', `SELECT status,count(*)::int AS count FROM scraping.document_jobs GROUP BY status`],
        ['kcbQuote', `SELECT last_price,event_timestamp,source FROM market.live_quotes WHERE security_id='NSE:KCB'`],
        ['kcbCloses', `SELECT bar_time,close FROM market.candles WHERE security_id='NSE:KCB' AND interval='1d' ORDER BY bar_time DESC LIMIT 5`],
    ])
        console.log(label, JSON.stringify((await query(sql)).rows));
}
finally {
    await pool.end();
}
