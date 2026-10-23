-- Durable private owner-prefix cleanup queue. No browser grants and no FK back
-- to the deleted identity: the cleanup receipt must survive account removal.
CREATE TABLE app_identity.account_media_cleanup (
 user_id uuid PRIMARY KEY,
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);
ALTER TABLE app_identity.account_media_cleanup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_identity.account_media_cleanup FROM PUBLIC,anon,authenticated;
