import dotenv from 'dotenv';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
dotenv.config({ path: '.env.local', quiet: true });
const version = '20261011123000', name = 'partial_reported_statements';
const sql = await readFile(new URL(`../../supabase/migrations/${version}_${name}.sql`, import.meta.url), 'utf8');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, statement_timeout: 60000 });
try {
    await client.connect();
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(20261011,123000)');
    if (!(await client.query('SELECT 1 FROM supabase_migrations.schema_migrations WHERE version=$1', [version])).rowCount) {
        await client.query(sql);
        await client.query('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES($1,$2,$3)', [version, name, [sql]]);
    }
    const checks = await client.query("SELECT count(*)::int AS count FROM information_schema.columns WHERE table_schema='market' AND is_nullable='YES' AND ((table_name='income_statements' AND column_name='eps') OR (table_name='cash_flow_statements' AND column_name='operating_cash_flow'))");
    if (checks.rows[0]?.count !== 2)
        throw new Error('Partial statement check failed');
    await client.query(process.argv.includes('--apply') ? 'COMMIT' : 'ROLLBACK');
    console.log(JSON.stringify({ version, applied: process.argv.includes('--apply'), validated: true }));
}
catch {
    await client.query('ROLLBACK').catch(() => { });
    console.error('Partial statement migration failed; rolled back.');
    process.exitCode = 1;
}
finally {
    await client.end().catch(() => { });
}
