BEGIN;
-- Cloudflare now handles application files. Keep existing read/removal rules,
-- but an older client must not refill Supabase through a permissive upload rule.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
   AND policyname='continua_cloudflare_only_file_writes') THEN
  CREATE POLICY continua_cloudflare_only_file_writes ON storage.objects
   AS RESTRICTIVE FOR ALL TO anon,authenticated USING(true) WITH CHECK(false);
 END IF;
END $$;
COMMENT ON POLICY continua_cloudflare_only_file_writes ON storage.objects IS
 'Application file inserts and updates moved to Cloudflare; existing read/removal policies remain authoritative.';
COMMIT;
