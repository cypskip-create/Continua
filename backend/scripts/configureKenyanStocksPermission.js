import 'dotenv/config';
import pg from 'pg';
// Explicit operator confirmation in this chat, 12 October 2026. This records
// an assertion, not an independently verified contract or invented licence.
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, statement_timeout: 15000 });
try {
    await db.connect();
    await db.query('BEGIN');
    await db.query(`UPDATE scraping.sources SET redistribution_allowed=true,
 allowed_usage='Automated downloads and display to paying Continua users; operator confirmed 2026-10-12',
 config=config || $1::jsonb,updated_at=now() WHERE id='kenyanstocks'`, [JSON.stringify({ permissionReference: 'operator-confirmation:2026-10-12:kenyanstocks', permissionBasis: 'user_assertion' })]);
    // Correct only the bare ticker placeholder, preserving curated company data.
    const result = await db.query(`UPDATE market.companies c SET name='Kenya Pipeline Company PLC'
 FROM market.securities s WHERE s.company_id=c.id AND s.exchange='NSE' AND s.symbol='KPC' AND c.name='KPC'`);
    await db.query('COMMIT');
    console.log(JSON.stringify({ permissionRecorded: true, companyNamesUpdated: result.rowCount }));
}
catch (e) {
    await db.query('ROLLBACK').catch(() => { });
    console.error(JSON.stringify({ code: e.code ?? 'configuration_failed' }));
    process.exitCode = 1;
}
finally {
    await db.end();
}
