-- Apply explicitly after Better Auth's pinned schema migration. Never on startup.
-- Service-owned tables have no browser or anonymous grants.
ALTER TABLE app_identity.users DROP CONSTRAINT users_source_provider_check;
ALTER TABLE app_identity.users ADD CONSTRAINT users_source_provider_check CHECK(source_provider IN('supabase','neon','better-auth'));
ALTER TABLE app_identity.provider_links DROP CONSTRAINT provider_links_provider_check;
ALTER TABLE app_identity.provider_links ADD CONSTRAINT provider_links_provider_check CHECK(provider IN('neon','better-auth'));

CREATE TABLE app_identity.session_assurance (
 session_id uuid PRIMARY KEY REFERENCES app_identity.continua_auth_session(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES app_identity.continua_auth_user(id) ON DELETE CASCADE,
 password_verified_at timestamptz,
 mfa_verified_at timestamptz
);
ALTER TABLE app_identity.session_assurance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA app_identity FROM PUBLIC,anon,authenticated;

CREATE FUNCTION app_identity.sync_auth_identity() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  INSERT INTO app_identity.users(id,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at,source_provider)
   VALUES(NEW.id,NEW.email,CASE WHEN NEW."emailVerified" THEN now() ELSE NULL END,
    coalesce(NEW."userMetadata",'{}'::jsonb)||jsonb_build_object('full_name',NEW.name),NEW."createdAt",NEW."updatedAt",'better-auth')
   ON CONFLICT(id) DO NOTHING;
  INSERT INTO app_identity.provider_links(provider,subject,user_id,evidence)
   VALUES('better-auth',NEW.id::text,NEW.id,'Authenticated provider UUID retained by explicit migration or registration');
  INSERT INTO public.profiles(user_id,full_name,email) VALUES(NEW.id,NEW.name,NEW.email)
   ON CONFLICT(user_id) DO NOTHING;
 ELSE
  UPDATE app_identity.users SET email=NEW.email,
   email_confirmed_at=CASE WHEN NEW."emailVerified" THEN coalesce(email_confirmed_at,now()) ELSE NULL END,
   updated_at=NEW."updatedAt" WHERE id=NEW.id;
  UPDATE public.profiles SET email=NEW.email WHERE user_id=NEW.id AND email IS DISTINCT FROM NEW.email;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app_identity.sync_auth_identity() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER continua_auth_identity_insert AFTER INSERT ON app_identity.continua_auth_user
 FOR EACH ROW EXECUTE FUNCTION app_identity.sync_auth_identity();
CREATE TRIGGER continua_auth_identity_update AFTER UPDATE OF email,"emailVerified" ON app_identity.continua_auth_user
 FOR EACH ROW EXECUTE FUNCTION app_identity.sync_auth_identity();

-- Existing migrated identities have already been matched by UUID and email.
INSERT INTO app_identity.provider_links(provider,subject,user_id,evidence)
 SELECT 'better-auth',u.id::text,u.id,'Original UUID and email matched against the consistent restored source snapshot'
 FROM app_identity.continua_auth_user u JOIN app_identity.users i ON i.id=u.id AND i.email=u.email
 ON CONFLICT(provider,subject) DO NOTHING;

-- The proof is server-written after successful password/TOTP verification.
-- A token's issuance time or the user's enabled MFA flag is not proof.
CREATE OR REPLACE FUNCTION public.continua_session_meets_mfa() RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(
  SELECT 1 FROM app_identity.continua_auth_session s
  JOIN app_identity.continua_auth_user u ON u.id=s."userId"
  LEFT JOIN app_identity.session_assurance a ON a.session_id=s.id AND a.user_id=u.id
  WHERE s.id::text=auth.jwt()->>'session_id' AND s."userId"=auth.uid() AND s."expiresAt">now()
   AND (NOT coalesce(u."twoFactorEnabled",false) OR a.mfa_verified_at IS NOT NULL))
$$;
REVOKE ALL ON FUNCTION public.continua_session_meets_mfa() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.continua_session_meets_mfa() TO authenticated;
