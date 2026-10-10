import dotenv from "dotenv";
import pg from "pg";

// Print only connection checks, never the URL, password or raw database errors.
dotenv.config({ path: ".env.local", quiet: true });
const raw = process.env.DATABASE_URL;
let target: URL;
try { target = new URL(raw ?? ""); }
catch { console.log(JSON.stringify({ databaseConfigured: false, validConnectionUrl: false })); process.exit(1); }
const postgresUrl = ["postgres:", "postgresql:"].includes(target.protocol);
console.log(JSON.stringify({
  databaseConfigured: true, postgresUrl,
  knownAppProject: target.hostname.includes("jjsetogmnumoudrovpzn") || decodeURIComponent(target.username).includes("jjsetogmnumoudrovpzn"),
  liveKey: process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_live_") === true,
  liveCheckoutFlag: process.env.PAYSTACK_LIVE_CHECKOUT_ENABLED === "true",
  callbackConfigured: !!process.env.PAYSTACK_CALLBACK_URL,
}));
if (!postgresUrl) process.exit(1);
const client = new pg.Client({ connectionString: raw, connectionTimeoutMillis: 10_000, statement_timeout: 10_000 });
try {
  await client.connect();
  const result = await client.query("SELECT to_regclass('public.profiles') IS NOT NULL AS profiles_exist, to_regclass('public.paystack_live_orders') IS NOT NULL AS live_orders_exist");
  console.log(JSON.stringify({ connected: true, ...result.rows[0] }));
} catch (error) {
  console.log(JSON.stringify({ connected: false, errorCode: (error as { code?: string }).code ?? "connection_error" }));
  process.exitCode = 1;
} finally { await client.end().catch(() => {}); }
