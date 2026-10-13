import 'dotenv/config';
import pg from 'pg';
import { readFileSync } from 'node:fs';
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, statement_timeout: 15000 });
try {
    await db.connect();
    const instruments = await db.query("SELECT s.id,s.symbol,s.status,c.name,q.last_price,q.event_timestamp FROM market.securities s LEFT JOIN market.companies c ON c.id=s.company_id LEFT JOIN market.live_quotes q ON q.security_id=s.id WHERE s.symbol IN('KPC','KPLC') AND s.exchange='NSE'");
    const source = await db.query("SELECT enabled,redistribution_allowed,license,config->>'permissionReference' IS NOT NULL AS has_permission FROM scraping.sources WHERE id='kenyanstocks'");
    const jobs = await db.query("SELECT status,count(*)::int FROM scraping.document_jobs WHERE source_id='kenyanstocks' GROUP BY status");
    const failures = await db.query("SELECT url,error_reason,attempts FROM scraping.document_jobs WHERE source_id='kenyanstocks' AND status='failed' ORDER BY updated_at DESC LIMIT 10");
    const directory = await db.query("SELECT s.symbol,c.name,s.status FROM market.securities s LEFT JOIN market.companies c ON c.id=s.company_id WHERE s.exchange='NSE' ORDER BY s.symbol");
    const missing = await db.query(`SELECT DISTINCT document->'context'->>'ticker' AS ticker FROM scraping.document_jobs j WHERE source_id='kenyanstocks' AND document->'context'->>'ticker' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM market.securities s WHERE s.exchange='NSE' AND s.symbol=CASE document->'context'->>'ticker' WHEN 'DTK' THEN 'DTB' WHEN 'SBIC' THEN 'STANBIC' WHEN 'HFCK' THEN 'HFCB' ELSE document->'context'->>'ticker' END)`);
    const coverage = await db.query(`SELECT a.metadata->>'ticker' AS ticker,a.metadata->>'tab' AS tab,a.metadata->>'category' AS category,jsonb_array_length(e.tables) AS tables,a.metadata->'coverage' AS coverage FROM scraping.raw_artifacts a JOIN LATERAL(SELECT tables FROM scraping.extractions WHERE artifact_id=a.id ORDER BY id DESC LIMIT 1)e ON true WHERE a.source_id='kenyanstocks' ORDER BY a.id DESC LIMIT 20`);
    const frontend = new Set([...readFileSync('../app/src/data/nseSecurities.ts', 'utf8').matchAll(/ticker: "([A-Z0-9]+)"/g)].map(m => m[1]));
    const frontendAliases = { DTB: 'DTK', STANBIC: 'SBIC', HFCB: 'HFCK' };
    const formerlyHidden = directory.rows.filter(r => r.status !== 'delisted' && !frontend.has(frontendAliases[r.symbol] ?? r.symbol)).map(r => r.symbol);
    console.log(JSON.stringify({ instruments: instruments.rows, source: source.rows, jobs: jobs.rows, failures: failures.rows, directory: directory.rows, publisherTickersMissingFromBackend: missing.rows, additionalListingsOmittedByStaticFrontend: formerlyHidden, coverage: coverage.rows }));
}
catch (e) {
    console.log(JSON.stringify({ code: e.code ?? 'diagnostic_failed' }));
    process.exitCode = 1;
}
finally {
    await db.end();
}
