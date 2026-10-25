-- Explicit operator migration, verified first on the isolated staging branch.
-- Production execution separately approved 2026-10-25. Never run on startup.
-- Existing identities, profiles, holdings and billing rows are not rewritten.
BEGIN;
ALTER TABLE app_identity.users DROP CONSTRAINT users_source_provider_check;
ALTER TABLE app_identity.users ADD CONSTRAINT users_source_provider_check
 CHECK(source_provider IN('supabase','neon','better-auth','neon-managed'));
DROP INDEX app_identity.application_identity_email;
CREATE UNIQUE INDEX application_identity_email ON app_identity.users(lower(email))
 WHERE email IS NOT NULL AND email<>'' AND deleted_at IS NULL AND source_provider<>'neon-managed';
CREATE UNIQUE INDEX application_managed_identity_email ON app_identity.users(lower(email))
 WHERE email IS NOT NULL AND email<>'' AND deleted_at IS NULL AND source_provider='neon-managed';

CREATE TABLE app_identity.managed_registration_intents (
 issuer text NOT NULL, subject text NOT NULL,
 metadata jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(issuer,subject), CHECK(metadata->>'adult_self_attested'='true')
);
CREATE TABLE app_identity.managed_oauth_intents (
 digest text PRIMARY KEY CHECK(length(digest)=64),
 metadata jsonb NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE app_identity.managed_identities (
 issuer text NOT NULL, subject text NOT NULL,
 user_id uuid NOT NULL REFERENCES app_identity.users(id) ON DELETE CASCADE,
 state text NOT NULL DEFAULT 'active' CHECK(state IN('active','deleting','deleted')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(issuer,subject), UNIQUE(issuer,user_id)
);
CREATE TABLE app_identity.managed_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), issuer text NOT NULL,
 subject text NOT NULL, managed_session_id text NOT NULL,
 user_id uuid NOT NULL REFERENCES app_identity.users(id) ON DELETE CASCADE,
 cookie_ciphertext text NOT NULL, expires_at timestamptz NOT NULL,
 last_verified_at timestamptz NOT NULL DEFAULT now(),
 password_verified_at timestamptz, oauth_verified_at timestamptz,
 revoked_at timestamptz,
 FOREIGN KEY(issuer,subject) REFERENCES app_identity.managed_identities(issuer,subject),
 UNIQUE(issuer,managed_session_id)
);
CREATE TABLE app_identity.managed_access_tokens (
 digest text PRIMARY KEY CHECK(length(digest)=64),
 session_id uuid NOT NULL REFERENCES app_identity.managed_sessions(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL
);
CREATE INDEX managed_access_expiry ON app_identity.managed_access_tokens(expires_at);
ALTER TABLE app_identity.managed_registration_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_identity.managed_oauth_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_identity.managed_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_identity.managed_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_identity.managed_access_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_identity.managed_registration_intents,app_identity.managed_oauth_intents,
 app_identity.managed_identities,app_identity.managed_sessions,app_identity.managed_access_tokens
 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.continua_session_meets_mfa() RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND CASE WHEN auth.jwt()->>'auth_provider'='neon-managed' THEN EXISTS(
  SELECT 1 FROM app_identity.managed_sessions s
  JOIN app_identity.managed_identities m ON m.issuer=s.issuer AND m.subject=s.subject AND m.user_id=s.user_id
  JOIN app_identity.users u ON u.id=s.user_id AND u.deleted_at IS NULL AND u.source_provider='neon-managed'
  JOIN app_identity.managed_access_tokens t ON t.session_id=s.id
  WHERE s.id::text=auth.jwt()->>'session_id' AND s.user_id=auth.uid()
   AND s.issuer=auth.jwt()->>'auth_issuer' AND t.digest=auth.jwt()->>'managed_token_digest'
   AND s.revoked_at IS NULL AND s.expires_at>now() AND t.expires_at>now()
   AND s.last_verified_at>now()-interval '15 seconds' AND m.state='active'
 ) ELSE EXISTS(
  SELECT 1 FROM app_identity.continua_auth_session s
  JOIN app_identity.continua_auth_user u ON u.id=s."userId"
  LEFT JOIN app_identity.session_assurance a ON a.session_id=s.id AND a.user_id=u.id
  WHERE s.id::text=auth.jwt()->>'session_id' AND s."userId"=auth.uid() AND s."expiresAt">now()
   AND (NOT coalesce(u."twoFactorEnabled",false) OR a.mfa_verified_at IS NOT NULL)
 ) END
$$;
REVOKE ALL ON FUNCTION public.continua_session_meets_mfa() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.continua_session_meets_mfa() TO authenticated;
COMMIT;
