CREATE TABLE app_identity.daily_email_budget (
 day date PRIMARY KEY,
 attempts integer NOT NULL CHECK(attempts BETWEEN 1 AND 250)
);
ALTER TABLE app_identity.daily_email_budget ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_identity.daily_email_budget FROM PUBLIC,anon,authenticated;
