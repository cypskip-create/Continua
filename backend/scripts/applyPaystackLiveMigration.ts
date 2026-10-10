import dotenv from "dotenv";
import pg from "pg";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
dotenv.config({ path: ".env.local", quiet: true });
const version="20261010210000", name="paystack_live_checkout";
const sql=await readFile(new URL(`../../supabase/migrations/${version}_${name}.sql`,import.meta.url),"utf8");
const client=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000,statement_timeout:20000});
let transaction=false;
try {
  if(!process.env.DATABASE_URL)throw new Error("Missing database configuration");
  await client.connect();
  if(!process.argv.includes("--apply") && !process.argv.includes("--validate")) {
    const checks=await client.query(`SELECT to_regclass('public.paystack_live_orders') IS NOT NULL AS live_orders_exist,
      EXISTS(SELECT 1 FROM pg_available_extensions WHERE name='pg_cron') AS cron_available`);
    console.log(JSON.stringify({connected:true,liveKeyConfigured:process.env.PAYSTACK_SECRET_KEY?.startsWith('sk_live_')===true,...checks.rows[0]}));
  } else {
    await client.query("BEGIN");transaction=true;
    await client.query("SELECT pg_advisory_xact_lock(20261010,210000)");
    const applied=await client.query("SELECT version FROM supabase_migrations.schema_migrations WHERE version=$1",[version]);
    if(!applied.rowCount){
      const existing=await client.query("SELECT to_regclass('public.paystack_live_orders') IS NOT NULL AS present");
      if(existing.rows[0].present)throw new Error("Untracked live ledger");
      await client.query(sql);
      await client.query("INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES($1,$2,$3)",[version,name,[sql]]);
    }
    const protection=await client.query(`SELECT c.relrowsecurity AS rls_enabled,
      NOT has_table_privilege('anon','public.paystack_live_orders','SELECT,INSERT,UPDATE,DELETE') AS anon_blocked,
      NOT has_table_privilege('authenticated','public.paystack_live_orders','SELECT,INSERT,UPDATE,DELETE') AS authenticated_blocked,
      NOT has_function_privilege('authenticated','public.fulfill_paystack_live_order(text,bigint,timestamptz)','EXECUTE') AS self_activation_blocked,
      EXISTS(SELECT 1 FROM cron.job WHERE jobname='continua-membership-expiry' AND active) AS expiry_job_enabled
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='paystack_live_orders'`);
    if(!protection.rows[0]||!Object.values(protection.rows[0]).every(v=>v===true))throw new Error("Live billing protection failed");
    // Entire synthetic-user smoke test is rolled back to its savepoint, even on --apply.
    await client.query('SAVEPOINT billing_smoke');
    const uid=randomUUID(),reference=`continua-live-${randomUUID()}`,reference2=`continua-live-${randomUUID()}`;
    await client.query("INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data) VALUES($1,'authenticated','authenticated',$2,'{}')",[uid,`billing-smoke-${uid}@example.invalid`]);
    await client.query("INSERT INTO public.profiles(user_id,subscription_plan) VALUES($1,'free') ON CONFLICT(user_id) DO NOTHING",[uid]);
    await client.query("INSERT INTO public.paystack_live_orders(reference,user_id,email,plan,cycle,amount_minor) VALUES($1,$2,$3,'premium_plus','annual',996000)",[reference,uid,`billing-smoke-${uid}@example.invalid`]);
    const first=await client.query("SELECT public.fulfill_paystack_live_order($1,900000000001,now()) AS receipt",[reference]);
    const retry=await client.query("SELECT public.fulfill_paystack_live_order($1,900000000001,now()) AS receipt",[reference]);
    if(JSON.stringify(first.rows[0])!==JSON.stringify(retry.rows[0]))throw new Error('Retry changed membership term');
    const activated=await client.query("SELECT subscription_plan='premium_plus' AND subscription_expires_at>now()+interval '364 days' AS correct FROM public.profiles WHERE user_id=$1",[uid]);
    if(!activated.rows[0]?.correct)throw new Error('Membership activation failed');
    await client.query("INSERT INTO public.paystack_live_orders(reference,user_id,email,plan,cycle,amount_minor) VALUES($1,$2,$3,'premium_plus','monthly',100000)",[reference2,uid,`billing-smoke-${uid}@example.invalid`]);
    const renewal=await client.query("SELECT public.fulfill_paystack_live_order($1,900000000002,now()) AS receipt",[reference2]);
    if(Date.parse(renewal.rows[0].receipt.expiresAt)<=Date.parse(first.rows[0].receipt.expiresAt))throw new Error('Renewal did not extend term');
    await client.query("UPDATE public.profiles SET subscription_expires_at=now()-interval '1 second' WHERE user_id=$1",[uid]);
    const expired=await client.query("SELECT public.effective_subscription_plan($1)='free' AS correct",[uid]);
    if(!expired.rows[0]?.correct)throw new Error('Expired membership remained paid');
    await client.query('ROLLBACK TO SAVEPOINT billing_smoke');
    const validateOnly=process.argv.includes('--validate');
    await client.query(validateOnly?'ROLLBACK':'COMMIT');transaction=false;
    console.log(JSON.stringify({applied:!validateOnly,validated:true,activationRetryRenewalExpiryPassed:true,migration:version,alreadyApplied:!!applied.rowCount,...protection.rows[0]}));
  }
}catch(error){if(transaction)await client.query("ROLLBACK").catch(()=>{});console.log(JSON.stringify({applied:false,errorCode:(error as {code?:string}).code??'migration_check_failed'}));process.exitCode=1;}
finally{await client.end().catch(()=>{});}
