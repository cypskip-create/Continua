import dotenv from 'dotenv';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
dotenv.config({ path: '.env.local', quiet: true });
const migrations = [['20261012010000', 'engine_forecast_notebook'], ['20261012011000', 'financial_version_audit']];
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, statement_timeout: 60000 });
let transaction = false;
try {
    if (!process.env.DATABASE_URL)
        throw new Error('Database configuration missing');
    await client.connect();
    await client.query('BEGIN');
    transaction = true;
    await client.query('SELECT pg_advisory_xact_lock(20261012,11000)');
    const changed = [];
    for (const [version, name] of migrations) {
        const exists = await client.query('SELECT version FROM supabase_migrations.schema_migrations WHERE version=$1', [version]);
        if (!exists.rowCount) {
            const sql = await readFile(new URL(`../../supabase/migrations/${version}_${name}.sql`, import.meta.url), 'utf8');
            await client.query(sql);
            await client.query('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES($1,$2,$3)', [version, name, [sql]]);
            changed.push(version);
        }
    }
    const protections = await client.query(`SELECT
  NOT has_table_privilege('anon','market.engine_forecast_notebook','SELECT,INSERT,UPDATE,DELETE') AS notebook_anon_private,
  NOT has_table_privilege('authenticated','market.engine_forecast_notebook','SELECT,INSERT,UPDATE,DELETE') AS notebook_authenticated_private,
  NOT has_table_privilege('authenticated','market.financial_version_audit','SELECT,INSERT,UPDATE,DELETE') AS audit_private,
  (SELECT count(*)=4 FROM pg_trigger WHERE tgname='financial_version_capture' AND NOT tgisinternal) AS audit_triggers_ready`);
    if (!Object.values(protections.rows[0]).every(x => x === true))
        throw new Error('Migration protection check failed');
    // Trigger behavior is verified with a rolled-back change; no canonical EPS is altered.
    await client.query('SAVEPOINT audit_probe');
    const before = await client.query('SELECT count(*)::int AS count FROM market.financial_version_audit');
    await client.query(`UPDATE market.income_statements SET eps=COALESCE(eps,0)+1 WHERE period_id=(SELECT period_id FROM market.income_statements ORDER BY period_id LIMIT 1)`);
    const after = await client.query('SELECT count(*)::int AS count FROM market.financial_version_audit');
    const hasRows = (await client.query('SELECT count(*)::int AS count FROM market.income_statements')).rows[0].count > 0;
    if (hasRows && after.rows[0].count !== before.rows[0].count + 1)
        throw new Error('Audit trigger probe failed');
    await client.query('ROLLBACK TO SAVEPOINT audit_probe');
    const apply = process.argv.includes('--apply');
    await client.query(apply ? 'COMMIT' : 'ROLLBACK');
    transaction = false;
    console.log(JSON.stringify({ applied: apply, migrations: changed, validated: true, protections: protections.rows[0], auditProbeRolledBack: true }));
}
catch (e) {
    if (transaction)
        await client.query('ROLLBACK').catch(() => { });
    console.log(JSON.stringify({ applied: false, errorCode: e.code ?? 'engine_expansion_migration_failed' }));
    process.exitCode = 1;
}
finally {
    await client.end().catch(() => { });
}
