// Disposable PostgreSQL only. No production credentials or real accounts.
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../../.qa-artifacts/canonical-fixture/package.json',import.meta.url));
const {PGlite}=require('@electric-sql/pglite');const db=new PGlite();let checks=0;
const check=(a,b)=>{assert.deepEqual(a,b);checks++;};
const owner='12345678-1234-4123-8123-123456789012',other='22345678-1234-4123-8123-123456789012';
const claims=async(aal,sub=owner)=>{await db.query("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub,role:'authenticated',aal})]);};
try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE ROLE authenticator;
 CREATE SCHEMA auth;CREATE TABLE auth.mfa_factors(user_id uuid,status text);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'sub','')::uuid$$;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 CREATE FUNCTION public.get_research_quota() RETURNS int LANGUAGE plpgsql SECURITY DEFINER AS $$BEGIN RETURN 7; END$$;
 CREATE TABLE public.fixture_private(owner uuid,body text);ALTER TABLE public.fixture_private ENABLE ROW LEVEL SECURITY;
 CREATE POLICY fixture_owner ON public.fixture_private FOR ALL TO authenticated USING(owner=auth.uid()) WITH CHECK(owner=auth.uid());
 GRANT USAGE ON SCHEMA auth TO authenticated;GRANT SELECT,INSERT ON public.fixture_private TO authenticated;
 INSERT INTO public.fixture_private VALUES('${owner}','fixture private record');`);
 const migration=await readFile(new URL('../../supabase/migrations/20261019120000_session_assurance.sql',import.meta.url),'utf8');
 await db.exec(migration);await db.exec(migration);
 await claims('aal1');await db.exec('SET ROLE authenticated');
 check((await db.query('SELECT count(*)::int n FROM public.fixture_private')).rows[0].n,1);
 await db.exec('SELECT public.continua_session_guard()');checks++;
 await db.exec('RESET ROLE');await db.query("INSERT INTO auth.mfa_factors VALUES($1,'verified')",[owner]);
 await db.exec('SET ROLE authenticated');check((await db.query('SELECT count(*)::int n FROM public.fixture_private')).rows[0].n,0);
 await assert.rejects(db.query('SELECT public.continua_session_guard()'),/two-step verification/);checks++;
 await assert.rejects(db.query('SELECT public.get_research_quota()'),/two-step verification/);checks++;
 await claims('aal2');check((await db.query('SELECT count(*)::int n FROM public.fixture_private')).rows[0].n,1);
 await db.exec('SELECT public.continua_session_guard()');checks++;
 await claims('aal2',other);check((await db.query('SELECT count(*)::int n FROM public.fixture_private')).rows[0].n,0);
 await db.exec('RESET ROLE');check((await db.query("SELECT has_table_privilege('authenticated','auth.mfa_factors','SELECT') allowed")).rows[0].allowed,false);
 console.log(JSON.stringify({sessionAssuranceChecks:checks,passed:true,fixtureOnly:true}));
}finally{await db.close();}
