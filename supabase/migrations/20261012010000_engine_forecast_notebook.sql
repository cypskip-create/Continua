-- Private, server-owned non-trading research questions. No balances or rewards.
CREATE TABLE IF NOT EXISTS market.engine_forecast_notebook (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 security_id text NOT NULL REFERENCES market.securities(id),
 symbol text NOT NULL,
 question text NOT NULL CHECK(length(question) BETWEEN 10 AND 400),
 rules text NOT NULL CHECK(length(rules) BETWEEN 20 AND 2000),
 deadline timestamptz NOT NULL,
 probability numeric NOT NULL CHECK(probability BETWEEN 0 AND 1),
 revisions jsonb NOT NULL CHECK(jsonb_typeof(revisions)='array' AND jsonb_array_length(revisions) BETWEEN 1 AND 100),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','void')),
 outcome boolean,
 resolution_source text,
 resolution_note text,
 created_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz,
 CHECK(deadline>created_at),
 CHECK((status='open' AND outcome IS NULL AND resolved_at IS NULL) OR
       (status='resolved' AND outcome IS NOT NULL AND resolved_at>=deadline AND resolution_source LIKE 'https://%') OR
       (status='void' AND outcome IS NULL AND resolved_at>=deadline AND resolution_source LIKE 'https://%'))
);
CREATE INDEX IF NOT EXISTS engine_forecast_notebook_owner ON market.engine_forecast_notebook(user_id,created_at DESC);
ALTER TABLE market.engine_forecast_notebook ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON market.engine_forecast_notebook FROM anon,authenticated;
-- All operations go through verified owner-scoped Premium Plus backend routes.
CREATE OR REPLACE FUNCTION market.protect_forecast_rules() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,market AS $$
BEGIN
 IF NEW.id<>OLD.id OR NEW.user_id<>OLD.user_id OR NEW.security_id<>OLD.security_id OR NEW.symbol<>OLD.symbol
    OR NEW.question<>OLD.question OR NEW.rules<>OLD.rules OR NEW.deadline<>OLD.deadline OR NEW.created_at<>OLD.created_at THEN
  RAISE EXCEPTION 'Forecast rules and identity are immutable';
 END IF;
 IF OLD.status<>'open' AND to_jsonb(NEW)<>to_jsonb(OLD) THEN RAISE EXCEPTION 'Finalized forecasts are immutable'; END IF;
 IF NEW.revisions<>OLD.revisions THEN
  IF now()>=OLD.deadline OR jsonb_array_length(NEW.revisions)<>jsonb_array_length(OLD.revisions)+1
     OR (NEW.revisions - (jsonb_array_length(NEW.revisions)-1))<>OLD.revisions THEN
   RAISE EXCEPTION 'Only pre-deadline append-only revisions are allowed';
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS forecast_rules_guard ON market.engine_forecast_notebook;
CREATE TRIGGER forecast_rules_guard BEFORE UPDATE ON market.engine_forecast_notebook FOR EACH ROW EXECUTE FUNCTION market.protect_forecast_rules();
