-- Additive evidence ledger. Existing financial/action tables remain authoritative.
-- Original observations and competing sources are separate immutable revisions.
CREATE TABLE IF NOT EXISTS market.investment_observations (
 id text PRIMARY KEY,
 kind text NOT NULL CHECK(kind IN ('macro','event','factor','financial_extension')),
 natural_key text NOT NULL,
 security_id text REFERENCES market.securities(id),
 observed_date date NOT NULL,
 available_date date NOT NULL,
 artifact_id bigint NOT NULL REFERENCES scraping.raw_artifacts(id),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 parser_version text NOT NULL,
 verification text NOT NULL DEFAULT 'pending' CHECK(verification IN ('pending','verified','rejected')),
 verified_at timestamptz,
 ingested_at timestamptz NOT NULL DEFAULT now(),
 CHECK((verification='verified')=(verified_at IS NOT NULL)),
 UNIQUE(kind,natural_key,available_date,artifact_id,parser_version)
);
CREATE INDEX IF NOT EXISTS investment_observations_lookup
 ON market.investment_observations(kind,security_id,observed_date,available_date);
ALTER TABLE market.investment_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON market.investment_observations FROM anon,authenticated;
CREATE OR REPLACE FUNCTION market.protect_investment_revision()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,market AS $immutable$
BEGIN
 IF (NEW.id,NEW.kind,NEW.natural_key,NEW.security_id,NEW.observed_date,NEW.available_date,NEW.artifact_id,NEW.payload,NEW.parser_version,NEW.ingested_at)
   IS DISTINCT FROM (OLD.id,OLD.kind,OLD.natural_key,OLD.security_id,OLD.observed_date,OLD.available_date,OLD.artifact_id,OLD.payload,OLD.parser_version,OLD.ingested_at)
 THEN RAISE EXCEPTION 'Investment evidence revisions are immutable; append a correction' USING ERRCODE='22000'; END IF;
 RETURN NEW;
END $immutable$;
DROP TRIGGER IF EXISTS investment_revision_guard ON market.investment_observations;
CREATE TRIGGER investment_revision_guard BEFORE UPDATE ON market.investment_observations FOR EACH ROW EXECUTE FUNCTION market.protect_investment_revision();
REVOKE ALL ON FUNCTION market.protect_investment_revision() FROM PUBLIC,anon,authenticated;
-- Rights are checked at read time, so a later revocation removes eligibility.
CREATE OR REPLACE VIEW market.investment_evidence WITH(security_invoker=true) AS
 SELECT o.*,a.document_url AS source_url,a.retrieved_at,a.sha256,s.id AS source_id
 FROM market.investment_observations o
 JOIN scraping.raw_artifacts a ON a.id=o.artifact_id
 JOIN scraping.sources s ON s.id=a.source_id
 WHERE o.verification='verified' AND s.enabled AND s.redistribution_allowed=true
   AND length(trim(s.config->>'permissionReference')) BETWEEN 1 AND 200
   AND a.storage_path LIKE 'r2://continua-financial-documents/%'
   AND a.sha256 ~ '^[a-f0-9]{64}$' AND a.document_url LIKE 'https://%';
REVOKE ALL ON market.investment_evidence FROM anon,authenticated;
CREATE TABLE IF NOT EXISTS market.investment_simulations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
 kind text NOT NULL CHECK(kind IN ('optimization','backtest')),
 snapshot_id text NOT NULL CHECK(snapshot_id ~ '^[a-f0-9]{64}$'),
 configuration jsonb NOT NULL,
 result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS investment_simulations_owner ON market.investment_simulations(user_id,created_at DESC);
ALTER TABLE market.investment_simulations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON market.investment_simulations FROM anon,authenticated;
COMMENT ON TABLE market.investment_simulations IS 'Private hypothetical research only. Never writes public.portfolios or orders. API enforces owner and Plus entitlement.';

CREATE OR REPLACE FUNCTION market.investment_event_rows(cutoff date,target_symbol text DEFAULT NULL)
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=pg_catalog,market,scraping AS $events$
 WITH ledger AS (
  SELECT DISTINCT ON(natural_key,observed_date) payload || jsonb_build_object(
   'id',id,'date',observed_date,'availableAt',available_date,'sourceUrl',source_url,
   'retrievedAt',retrieved_at,'sha256',sha256,'symbol',split_part(security_id,':',2)) AS payload
  FROM market.investment_evidence WHERE kind='event' AND available_date<=cutoff
   AND (target_symbol IS NULL OR security_id='NSE:'||target_symbol)
  ORDER BY natural_key,observed_date,available_date DESC,ingested_at DESC,id DESC
 ), reports AS (
  SELECT jsonb_build_object('id','report:'||sec.id||':'||(f->>'periodId'),
    'periodId',f->>'periodId','type','financial-report','title',sec.symbol||' '||(f->>'fiscalYear')||' '||(f->>'periodType')||' report',
    'date',f->>'reportedAt','availableAt',f->>'reportedAt','sourceUrl',f->'sourceUrls'->>0,
    'status','published','symbol',sec.symbol,'terms',jsonb_build_object('periodEnd',f->>'periodEnd','currency',f->>'currency')) AS payload
  FROM market.securities sec
  CROSS JOIN LATERAL (SELECT f FROM market.canonical_financial_history(sec.id,'annual',20,false) f
    UNION ALL SELECT f FROM market.canonical_financial_history(sec.id,'quarterly',40,false) f) history
  WHERE sec.exchange='NSE' AND (target_symbol IS NULL OR sec.symbol=target_symbol)
    AND f->>'basis' IS DISTINCT FROM 'publisher_observation'
    AND NOT EXISTS(SELECT 1 FROM ledger WHERE ledger.payload->>'periodId'=f->>'periodId')
    AND f->>'reportedAt'<=cutoff::text AND f->'sourceUrls'->>0 LIKE 'https://%'
 ) SELECT payload FROM (SELECT payload FROM ledger UNION ALL SELECT payload FROM reports) all_events
 ORDER BY payload->>'date' DESC,payload->>'id' LIMIT 2000
 $events$;
REVOKE ALL ON FUNCTION market.investment_event_rows(date,text) FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS market.investment_event_preferences (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT false,
 held boolean NOT NULL DEFAULT true,
 watched boolean NOT NULL DEFAULT true,
 macro boolean NOT NULL DEFAULT false,
 enabled_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS market.investment_event_deliveries (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 observation_id text NOT NULL REFERENCES market.investment_observations(id),
 delivered_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,observation_id)
);
ALTER TABLE market.investment_event_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE market.investment_event_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON market.investment_event_preferences,market.investment_event_deliveries FROM anon,authenticated;
CREATE OR REPLACE FUNCTION market.deliver_investment_events(target_owner uuid DEFAULT NULL)
RETURNS integer LANGUAGE sql VOLATILE SECURITY INVOKER
SET search_path=pg_catalog,market,public AS $notify$
 WITH eligible AS MATERIALIZED (
 SELECT pref.user_id,e.id,e.payload,e.security_id
 FROM market.investment_event_preferences pref
 JOIN (SELECT DISTINCT ON(natural_key,security_id,observed_date) * FROM market.investment_evidence WHERE kind='event' AND available_date<=CURRENT_DATE ORDER BY natural_key,security_id,observed_date,available_date DESC,ingested_at DESC,id DESC) e ON e.ingested_at>=pref.enabled_at
 LEFT JOIN public.engine_preferences general ON general.user_id=pref.user_id
 WHERE pref.enabled AND coalesce((general.settings->>'notifications')::boolean,true)
  AND public.effective_subscription_plan(pref.user_id)='premium_plus'
  AND (target_owner IS NULL OR pref.user_id=target_owner)
  AND e.observed_date>=pref.enabled_at::date
  AND e.available_date<=CURRENT_DATE AND e.ingested_at>=now()-interval '14 days'
  AND ((pref.macro AND e.security_id IS NULL)
   OR (pref.held AND EXISTS(SELECT 1 FROM public.portfolios p WHERE p.user_id=pref.user_id AND 'NSE:'||p.symbol=e.security_id AND p.shares>0))
   OR (pref.watched AND EXISTS(SELECT 1 FROM public.watchlists w WHERE w.user_id=pref.user_id AND 'NSE:'||w.symbol=e.security_id)))
  AND NOT EXISTS(SELECT 1 FROM market.investment_event_deliveries d WHERE d.user_id=pref.user_id AND d.observation_id=e.id)
 ORDER BY e.ingested_at,e.id LIMIT 100
 ), receipts AS (
 INSERT INTO market.investment_event_deliveries(user_id,observation_id)
 SELECT user_id,id FROM eligible ON CONFLICT DO NOTHING RETURNING user_id,observation_id
 ), notices AS (
 INSERT INTO public.notifications(user_id,type,feature,title,message,action_url,entity_type)
 SELECT e.user_id,'engine','engine','Verified market event',left(coalesce(e.payload->>'title',e.payload->>'type','New verified disclosure'),500),
 '/engine?tool=Events'||CASE WHEN e.security_id IS NOT NULL THEN '&symbol='||replace(e.security_id,'NSE:','') ELSE '' END,'engine'
 FROM eligible e JOIN receipts r ON r.user_id=e.user_id AND r.observation_id=e.id RETURNING id
 ) SELECT count(*)::integer FROM notices
 $notify$;
REVOKE ALL ON FUNCTION market.deliver_investment_events(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION market.investment_coverage_rows()
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=pg_catalog,market,scraping AS $coverage$
 SELECT jsonb_build_object('symbol',s.symbol,'status',s.status,'listedAt',s.listed_at,
  'sourceLinkedCloses',prices.observations,'firstPrice',prices.first_date,'lastPrice',prices.last_date,
  'annualPeriods',annual.periods,'knownPublicationDates',annual.publications,'annualYears',annual.years,
  'interimPeriods',interim.periods,'storedActions',actions.records,
  'fieldCoverage',annual.fields,
  'unobservedFiscalYears',CASE WHEN s.listed_at IS NULL THEN NULL ELSE
   (SELECT jsonb_agg(y) FROM generate_series(greatest(2015,extract(year FROM s.listed_at)::integer),extract(year FROM CURRENT_DATE)::integer-1) y
    WHERE NOT coalesce(annual.years,'[]'::jsonb) @> to_jsonb(y)) END)
 FROM market.securities s
 CROSS JOIN LATERAL (SELECT count(*)::integer AS observations,min(bar_time)::date AS first_date,max(bar_time)::date AS last_date
  FROM market.candles WHERE security_id=s.id AND interval='1d' AND close>0 AND source_url LIKE 'https://%') prices
 CROSS JOIN LATERAL (SELECT count(*)::integer AS periods,count(*) FILTER(WHERE f->>'reportedAt' IS NOT NULL)::integer AS publications,
  jsonb_agg(DISTINCT (f->>'fiscalYear')::integer) AS years,
  jsonb_build_object('revenue',count(*) FILTER(WHERE f->>'revenue' IS NOT NULL),'netIncome',count(*) FILTER(WHERE f->>'netIncome' IS NOT NULL),
   'equity',count(*) FILTER(WHERE f->>'totalEquity' IS NOT NULL),'cashFlow',count(*) FILTER(WHERE f->>'operatingCashFlow' IS NOT NULL)) AS fields
  FROM market.canonical_financial_history(s.id,'annual',20,false) f) annual
 CROSS JOIN LATERAL (SELECT count(*)::integer AS periods FROM market.canonical_financial_history(s.id,'quarterly',50,false)) interim
 CROSS JOIN LATERAL (SELECT count(*)::integer AS records FROM market.corporate_actions WHERE security_id=s.id) actions
 WHERE s.exchange='NSE' ORDER BY s.symbol
 $coverage$;
REVOKE ALL ON FUNCTION market.investment_coverage_rows() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION market.save_investment_simulation(owner_id uuid,simulation_name text,simulation_kind text,input_hash text,config jsonb,output jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path=pg_catalog,market AS $save$
DECLARE receipt jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('investment-simulation:'||owner_id::text,7));
 IF (SELECT count(*) FROM market.investment_simulations WHERE user_id=owner_id)>=25 THEN RETURN NULL; END IF;
 IF octet_length(config::text)>2097152 OR octet_length(output::text)>4194304 THEN RETURN NULL; END IF;
 INSERT INTO market.investment_simulations(user_id,name,kind,snapshot_id,configuration,result)
 VALUES(owner_id,simulation_name,simulation_kind,input_hash,config,output)
 RETURNING jsonb_build_object('id',id,'name',name,'created_at',created_at) INTO receipt;
 RETURN receipt;
END $save$;
REVOKE ALL ON FUNCTION market.save_investment_simulation(uuid,text,text,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
