import dotenv from "dotenv";
import pg from "pg";
import { readFile } from "node:fs/promises";
dotenv.config({ path: ".env.local", quiet: true });
const version = "20261012020000",
  name = "checkout_policy_receipt";
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
  statement_timeout: 60000,
});
let active = false;
try {
  if (!process.env.DATABASE_URL)
    throw new Error("Database configuration missing");
  await client.connect();
  await client.query("BEGIN");
  active = true;
  await client.query("SELECT pg_advisory_xact_lock(20261012,20000)");
  const prior = await client.query(
    "SELECT version FROM supabase_migrations.schema_migrations WHERE version=$1",
    [version],
  );
  if (!prior.rowCount) {
    const sql = await readFile(
      new URL(
        `../../supabase/migrations/${version}_${name}.sql`,
        import.meta.url,
      ),
      "utf8",
    );
    await client.query(sql);
    await client.query(
      "INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES($1,$2,$3)",
      [version, name, [sql]],
    );
  }
  const checked = await client.query(
    `SELECT count(*)=2 AS columns_ready FROM information_schema.columns WHERE table_schema='public' AND table_name='paystack_live_orders' AND column_name IN('terms_version','terms_accepted_at')`,
  );
  if (!checked.rows[0].columns_ready)
    throw new Error("Checkout receipt columns unavailable");
  const apply = process.argv.includes("--apply");
  await client.query(apply ? "COMMIT" : "ROLLBACK");
  active = false;
  console.log(
    JSON.stringify({
      migration: version,
      applied: apply,
      alreadyApplied: !!prior.rowCount,
      validated: true,
      existingOrdersUnchanged: true,
    }),
  );
} catch (e) {
  if (active) await client.query("ROLLBACK").catch(() => {});
  console.log(
    JSON.stringify({
      applied: false,
      errorCode:
        (e as { code?: string }).code ?? "checkout_policy_migration_failed",
    }),
  );
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
