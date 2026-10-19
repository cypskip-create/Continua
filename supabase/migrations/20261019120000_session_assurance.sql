BEGIN;
CREATE OR REPLACE FUNCTION public.continua_session_meets_mfa()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT auth.uid() IS NOT NULL AND (
 auth.jwt()->>'aal'='aal2' OR NOT EXISTS(
  SELECT 1 FROM auth.mfa_factors WHERE user_id=auth.uid() AND status='verified')) $$;
REVOKE ALL ON FUNCTION public.continua_session_meets_mfa() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.continua_session_meets_mfa() TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.continua_session_guard()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$ BEGIN
 IF auth.jwt()->>'role'='authenticated' AND NOT public.continua_session_meets_mfa() THEN
  RAISE insufficient_privilege USING MESSAGE='Complete two-step verification to continue.';
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.continua_session_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.continua_session_guard() TO anon,authenticated,service_role;

DO $$ DECLARE t record; definition text; guarded text; BEGIN
 -- Additional restrictive predicates never replace or widen owner policies.
 -- Realtime and direct Data API reads both use these RLS predicates.
 FOR t IN SELECT c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relrowsecurity
 LOOP
  EXECUTE format('DROP POLICY IF EXISTS continua_verified_mfa ON public.%I',t.relname);
  EXECUTE format('CREATE POLICY continua_verified_mfa ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.continua_session_meets_mfa())) WITH CHECK ((SELECT public.continua_session_meets_mfa()))',t.relname);
 END LOOP;
 -- Explicit caller-facing PL/pgSQL RPCs bypass RLS as definers. Preserve their
 -- existing bodies and privileges, adding the same guard at their entry point.
 FOR t IN SELECT p.oid,p.prosrc FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 JOIN pg_catalog.pg_language l ON l.oid=p.prolang
 WHERE n.nspname='public' AND l.lanname='plpgsql' AND p.prosecdef
 AND p.proname IN ('community_set_safety','community_submit_report',
 'get_or_create_default_watchlist_folder','get_research_quota','post_poll_result','record_research_view')
 LOOP
  IF position('public.continua_session_guard()' in t.prosrc)>0 THEN CONTINUE; END IF;
  guarded:=regexp_replace(t.prosrc,'\mBEGIN\M','BEGIN PERFORM public.continua_session_guard();','i');
  IF guarded=t.prosrc THEN RAISE EXCEPTION 'Unrecognized account RPC body; no changes committed'; END IF;
  definition:=pg_catalog.pg_get_functiondef(t.oid);
  EXECUTE replace(definition,t.prosrc,guarded);
 END LOOP;
 IF to_regprocedure('public.get_my_private_profile_fields()') IS NOT NULL THEN
  EXECUTE $fn$CREATE OR REPLACE FUNCTION public.get_my_private_profile_fields()
  RETURNS TABLE(gender text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
  AS 'SELECT p.gender FROM public.profiles p WHERE p.user_id=auth.uid() AND public.continua_session_meets_mfa()'$fn$;
 END IF;
END $$;
-- Hosted Supabase reserves ALTER ROLE authenticator. Use explicit RPC guards
-- plus restrictive RLS rather than changing provider-owned role configuration.
NOTIFY pgrst,'reload config';
NOTIFY pgrst,'reload schema';
COMMIT;
