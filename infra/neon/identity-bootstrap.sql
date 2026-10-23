-- Explicit staging bootstrap, never an API-startup migration.
-- Application identities retain their original UUIDs. No provider password,
-- refresh token, OAuth secret, or managed Auth schema is restored here.
CREATE SCHEMA IF NOT EXISTS app_identity;
CREATE SCHEMA IF NOT EXISTS auth;

DO $roles$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $roles$;

CREATE TABLE app_identity.users (
 id uuid PRIMARY KEY,
 email text,
 email_confirmed_at timestamptz,
 raw_user_meta_data jsonb NOT NULL DEFAULT '{}',
 raw_app_meta_data jsonb NOT NULL DEFAULT '{}',
 phone text,
 phone_confirmed_at timestamptz,
 created_at timestamptz NOT NULL,
 updated_at timestamptz,
 deleted_at timestamptz,
 source_provider text NOT NULL CHECK(source_provider IN('supabase','neon'))
);
CREATE UNIQUE INDEX application_identity_email ON app_identity.users(lower(email))
 WHERE email IS NOT NULL AND email<>'' AND deleted_at IS NULL;

CREATE TABLE app_identity.provider_links (
 provider text NOT NULL CHECK(provider='neon'),
 subject text NOT NULL CHECK(length(subject) BETWEEN 1 AND 200),
 user_id uuid NOT NULL REFERENCES app_identity.users(id) ON DELETE CASCADE,
 linked_at timestamptz NOT NULL DEFAULT now(),
 evidence text NOT NULL CHECK(length(evidence) BETWEEN 10 AND 500),
 PRIMARY KEY(provider,subject), UNIQUE(provider,user_id)
);

-- Independent application MFA records. The hosted provider's missing MFA API
-- must not silently disable the existing application security controls.
-- This table alone does NOT implement or certify the MFA migration.
CREATE TABLE app_identity.mfa_factors (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES app_identity.users(id) ON DELETE CASCADE,
 status text NOT NULL CHECK(status IN('unverified','verified')),
 factor_type text NOT NULL CHECK(factor_type='totp'),
 encrypted_secret bytea NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app_identity.migration_control (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 mode text NOT NULL CHECK(mode IN('staging','cutover-ready','production')),
 source_project text NOT NULL,
 source_snapshot text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);

-- These are application-owned compatibility helpers, not Supabase Auth.
-- Only a server-verified identity may populate the per-transaction claims.
-- Browser callers never receive SQL credentials or a set_config endpoint.
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE
 SET search_path='' AS $$
 SELECT coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)
$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
 SET search_path='' AS $$ SELECT nullif(auth.jwt()->>'sub','')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
 SET search_path='' AS $$ SELECT nullif(auth.jwt()->>'role','') $$;

ALTER TABLE app_identity.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_identity.provider_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_identity.mfa_factors ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_identity.migration_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON SCHEMA app_identity FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA app_identity FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SCHEMA auth FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA auth FROM PUBLIC;
GRANT USAGE ON SCHEMA auth TO anon,authenticated;
GRANT EXECUTE ON FUNCTION auth.jwt(),auth.uid(),auth.role() TO anon,authenticated;
