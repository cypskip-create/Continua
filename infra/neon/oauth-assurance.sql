-- User-approved private Google-only MFA/email proof; no browser grants.
ALTER TABLE app_identity.session_assurance ADD COLUMN IF NOT EXISTS oauth_verified_at timestamptz;
