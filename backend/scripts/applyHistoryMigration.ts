import dotenv from "dotenv";
import pg from "pg";
import { readFile } from "node:fs/promises";
dotenv.config({ path: ".env.local", quiet: true });
const version = "20261010220000", name = "historical_document_queue";
const sql = await readFile(new URL(`../../supabase/migrations/${version}_${name}.sql`, import.meta.url), "utf8");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, statement_timeout: 60000 });
let transaction = false;
try {
  if (!process.env.DATABASE_URL) throw new Error("Missing database configuration");
  await client.connect();
  await client.query("BEGIN"); transaction = true;
  await client.query("SELECT pg_advisory_xact_lock(20261010,220000)");
  const applied = await client.query("SELECT version FROM supabase_migrations.schema_migrations WHERE version=$1", [version]);
  if (!applied.rowCount) {
    await client.query(sql);
    await client.query("INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES($1,$2,$3)", [version,name,[sql]]);
  }
  const checks = await client.query(`SELECT
    NOT has_table_privilege('anon','scraping.document_jobs','SELECT,INSERT,UPDATE,DELETE') AS queue_private,
    NOT has_table_privilege('authenticated','scraping.archive_checkpoints','SELECT,INSERT,UPDATE,DELETE') AS checkpoints_private,
    NOT has_table_privilege('authenticated','market.price_history_sources','SELECT,INSERT,UPDATE,DELETE') AS provenance_private,
    EXISTS(SELECT 1 FROM storage.buckets WHERE id='scraper-raw' AND NOT public) AS bucket_private`);
  if (!Object.values(checks.rows[0] ?? {}).every(v => v === true)) throw new Error("History protection check failed");
  const apply = process.argv.includes("--apply");
  await client.query(apply ? "COMMIT" : "ROLLBACK"); transaction = false;
  console.log(JSON.stringify({ migration:version, applied:apply, alreadyApplied:!!applied.rowCount, validated:true, ...checks.rows[0] }));
} catch (error) {
  if (transaction) await client.query("ROLLBACK").catch(() => {});
  console.log(JSON.stringify({ applied:false, errorCode:(error as {code?:string}).code ?? "history_migration_failed" }));
  process.exitCode = 1;
} finally { await client.end().catch(() => {}); }
