import dotenv from "dotenv";
import pg from "pg";
import { readFile } from "node:fs/promises";

// Applies exactly one owner-approved additive migration. Never prints secrets.
dotenv.config({ path: ".env.local", quiet: true });
const version = "20261010180000";
const name = "paystack_test_checkout";
const sql = await readFile(new URL(`../../supabase/migrations/${version}_${name}.sql`, import.meta.url), "utf8");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000, statement_timeout: 15_000 });
let transaction = false;
try {
  if (!process.env.DATABASE_URL) throw new Error("Missing database configuration");
  await client.connect();
  const ledger = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='supabase_migrations' AND table_name='schema_migrations'");
  const columns = new Set(ledger.rows.map(row => row.column_name));
  if (!["version", "name", "statements"].every(column => columns.has(column))) throw new Error("Migration ledger needs manual review");
  if (!process.argv.includes("--apply")) {
    console.log(JSON.stringify({ connected: true, migrationLedgerReady: true, applyRequested: false }));
  } else {
    await client.query("BEGIN"); transaction = true;
    await client.query("SELECT pg_advisory_xact_lock(20261010,180000)");
    const applied = await client.query("SELECT version FROM supabase_migrations.schema_migrations WHERE version=$1", [version]);
    if (!applied.rowCount) {
      const existing = await client.query("SELECT to_regclass('public.paystack_test_orders') IS NOT NULL AS present");
      if (existing.rows[0].present) throw new Error("Untracked table requires manual review");
      await client.query(sql);
      await client.query("INSERT INTO supabase_migrations.schema_migrations (version,name,statements) VALUES ($1,$2,$3)", [version,name,[sql]]);
    }
    const protection = await client.query(`SELECT c.relrowsecurity AS rls_enabled,
      NOT has_table_privilege('anon','public.paystack_test_orders','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS anon_blocked,
      NOT has_table_privilege('authenticated','public.paystack_test_orders','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS authenticated_blocked,
      has_table_privilege('service_role','public.paystack_test_orders','SELECT') AND
      has_table_privilege('service_role','public.paystack_test_orders','INSERT') AND
      has_table_privilege('service_role','public.paystack_test_orders','UPDATE') AS service_access
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname='paystack_test_orders'`);
    const check = protection.rows[0];
    if (!check || !Object.values(check).every(value => value === true)) throw new Error("Table protection verification failed");
    const count = await client.query("SELECT count(*)::integer AS test_order_count FROM public.paystack_test_orders");
    await client.query("COMMIT"); transaction = false;
    console.log(JSON.stringify({ migration: version, applied: true, alreadyApplied: !!applied.rowCount, ...check, ...count.rows[0] }));
  }
} catch (error) {
  if (transaction) await client.query("ROLLBACK").catch(() => {});
  console.log(JSON.stringify({ applied: false, errorCode: (error as { code?: string }).code ?? "migration_check_failed" }));
  process.exitCode = 1;
} finally { await client.end().catch(() => {}); }
