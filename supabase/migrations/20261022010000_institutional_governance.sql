-- Explicit maintenance migration. Never run at API boot.
CREATE TABLE IF NOT EXISTS market.quantitative_models (
 id text NOT NULL, version text NOT NULL, definition jsonb NOT NULL,
 status text NOT NULL DEFAULT 'research' CHECK(status IN ('research','review-required','disabled')),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(id,version)
);
CREATE TABLE IF NOT EXISTS market.quantitative_runs (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 model_id text NOT NULL,model_version text NOT NULL,input_hash text NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),
 status text NOT NULL CHECK(status IN ('success','input-validation','worker-unavailable','capacity-busy')),
 summary jsonb NOT NULL DEFAULT '{}',runtime_ms integer CHECK(runtime_ms>=0),
 attempts integer NOT NULL DEFAULT 1,failure_attempts integer NOT NULL DEFAULT 0 CHECK(failure_attempts>=0),first_at timestamptz NOT NULL DEFAULT now(),last_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,model_id,model_version,input_hash),
 FOREIGN KEY(model_id,model_version) REFERENCES market.quantitative_models(id,version)
);
CREATE TABLE IF NOT EXISTS market.quantitative_datasets (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 data_hash text NOT NULL CHECK(data_hash ~ '^[a-f0-9]{64}$'),
 payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,data_hash)
);
CREATE TABLE IF NOT EXISTS market.quantitative_snapshots (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 input_hash text NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
 configuration jsonb NOT NULL,data_hash text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,input_hash),FOREIGN KEY(user_id,data_hash) REFERENCES market.quantitative_datasets(user_id,data_hash)
);
CREATE TABLE IF NOT EXISTS market.exposure_relationships (
 id text PRIMARY KEY,from_entity text NOT NULL,to_entity text NOT NULL,
 from_type text NOT NULL CHECK(from_type IN ('company','security','sector','shareholder','subsidiary','financial-institution','factor','currency','commodity','event','related-company')),
 to_type text NOT NULL CHECK(to_type IN ('company','security','sector','shareholder','subsidiary','financial-institution','factor','currency','commodity','event','related-company')),
 relation_type text NOT NULL CHECK(relation_type IN ('owns','subsidiary-of','sector','currency-exposure','commodity-exposure','lends-to','borrows-from','related-party','corporate-action')),
 effective_date date NOT NULL,available_date date NOT NULL,valid_to date,
 ownership_percent numeric CHECK(ownership_percent BETWEEN 0 AND 100),exposure_amount numeric,currency text,
 artifact_id bigint NOT NULL REFERENCES scraping.raw_artifacts(id),parser_version text NOT NULL,
 verification text NOT NULL DEFAULT 'pending' CHECK(verification IN ('pending','verified','rejected')),
 reviewed_at timestamptz,review_note text,source_cell jsonb NOT NULL,
 ingested_at timestamptz NOT NULL DEFAULT now(),
 CHECK(from_entity<>to_entity),CHECK(valid_to IS NULL OR valid_to>=effective_date),
 CHECK(exposure_amount IS NULL OR length(currency) BETWEEN 3 AND 10),
 CHECK(verification<>'verified' OR reviewed_at IS NOT NULL AND length(trim(review_note))>=10)
);
CREATE INDEX IF NOT EXISTS exposure_relationships_temporal ON market.exposure_relationships(from_entity,to_entity,effective_date,available_date);
CREATE OR REPLACE VIEW market.eligible_exposure_relationships WITH(security_invoker=true) AS
 SELECT e.*,a.document_url AS source_url,a.sha256,a.retrieved_at,s.id AS source_id
 FROM market.exposure_relationships e JOIN scraping.raw_artifacts a ON a.id=e.artifact_id
 JOIN scraping.sources s ON s.id=a.source_id
 WHERE e.verification='verified' AND s.enabled AND s.redistribution_allowed=true
 AND length(trim(s.config->>'permissionReference')) BETWEEN 1 AND 200
 AND a.storage_path LIKE 'r2://continua-financial-documents/%' AND a.sha256 ~ '^[a-f0-9]{64}$'
 AND a.document_url LIKE 'https://%';
DO $rls$ DECLARE name text;BEGIN
 FOREACH name IN ARRAY ARRAY['quantitative_models','quantitative_runs','quantitative_snapshots','quantitative_datasets','exposure_relationships'] LOOP
  EXECUTE format('ALTER TABLE market.%I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('REVOKE ALL ON market.%I FROM anon,authenticated',name);
 END LOOP;
END $rls$;
REVOKE ALL ON market.eligible_exposure_relationships FROM anon,authenticated;
CREATE OR REPLACE FUNCTION market.record_quantitative_run(owner uuid,model text,version text,hash text,state text,receipt jsonb,milliseconds integer)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,market AS $record$
BEGIN
 IF state NOT IN ('success','input-validation','worker-unavailable','capacity-busy') OR pg_column_size(receipt)>8192 THEN
  RAISE EXCEPTION 'Invalid quantitative receipt'; END IF;
 -- Bounded retention, no private raw data in operational metrics.
 DELETE FROM market.quantitative_runs WHERE user_id=owner AND last_at<now()-interval '90 days';
 PERFORM pg_advisory_xact_lock(hashtext(owner::text),77127);
 IF (SELECT count(*) FROM market.quantitative_runs WHERE user_id=owner)>=200
  AND NOT EXISTS(SELECT 1 FROM market.quantitative_runs WHERE user_id=owner AND model_id=model AND model_version=version AND input_hash=hash)
 THEN DELETE FROM market.quantitative_runs WHERE (user_id,model_id,model_version,input_hash) IN
  (SELECT user_id,model_id,model_version,input_hash FROM market.quantitative_runs WHERE user_id=owner ORDER BY last_at LIMIT 1); END IF;
 INSERT INTO market.quantitative_runs(user_id,model_id,model_version,input_hash,status,summary,runtime_ms,failure_attempts)
 VALUES(owner,model,version,hash,state,receipt,milliseconds,CASE WHEN state='success' THEN 0 ELSE 1 END)
 ON CONFLICT(user_id,model_id,model_version,input_hash) DO UPDATE
 SET status=EXCLUDED.status,summary=EXCLUDED.summary,runtime_ms=EXCLUDED.runtime_ms,attempts=quantitative_runs.attempts+1,failure_attempts=quantitative_runs.failure_attempts+EXCLUDED.failure_attempts,last_at=now();
END $record$;
CREATE OR REPLACE FUNCTION market.save_quantitative_snapshot(owner uuid,title text,hash text,input jsonb,output jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,market AS $save$
DECLARE saved market.quantitative_snapshots; dataset_hash text; dataset jsonb;
BEGIN
 IF length(trim(title)) NOT BETWEEN 1 AND 100 OR pg_column_size(input)>1048576 OR pg_column_size(output)>1048576
  OR output->'governance'->>'inputHash' IS DISTINCT FROM hash THEN RETURN NULL; END IF;
 dataset_hash=output->'governance'->>'dataHash';
 IF dataset_hash IS NULL OR dataset_hash !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(owner::text),77128);
 SELECT * INTO saved FROM market.quantitative_snapshots WHERE user_id=owner AND input_hash=hash;
 IF FOUND THEN RETURN jsonb_build_object('inputHash',saved.input_hash,'name',saved.name,'createdAt',saved.created_at); END IF;
 IF (SELECT count(*) FROM market.quantitative_snapshots WHERE user_id=owner)>=10 THEN RETURN NULL; END IF;
 SELECT coalesce(jsonb_object_agg(key,value),'{}'::jsonb) INTO dataset FROM jsonb_each(input)
 WHERE key IN ('observations','returns','edges','facts','rows','assets','factorHistory');
 INSERT INTO market.quantitative_datasets(user_id,data_hash,payload) VALUES(owner,dataset_hash,dataset) ON CONFLICT DO NOTHING;
 INSERT INTO market.quantitative_snapshots(user_id,input_hash,name,configuration,data_hash,result)
 VALUES(owner,hash,trim(title),input-ARRAY['observations','returns','edges','facts','rows','assets','factorHistory'],dataset_hash,output) RETURNING * INTO saved;
 RETURN jsonb_build_object('inputHash',saved.input_hash,'name',saved.name,'createdAt',saved.created_at);
END $save$;
REVOKE ALL ON FUNCTION market.record_quantitative_run(uuid,text,text,text,text,jsonb,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION market.save_quantitative_snapshot(uuid,text,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION market.protect_exposure_revision() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,market AS $guard$
BEGIN
 IF (NEW.id,NEW.from_entity,NEW.to_entity,NEW.from_type,NEW.to_type,NEW.relation_type,NEW.effective_date,NEW.available_date,NEW.valid_to,NEW.ownership_percent,NEW.exposure_amount,NEW.currency,NEW.artifact_id,NEW.parser_version,NEW.source_cell,NEW.ingested_at)
 IS DISTINCT FROM (OLD.id,OLD.from_entity,OLD.to_entity,OLD.from_type,OLD.to_type,OLD.relation_type,OLD.effective_date,OLD.available_date,OLD.valid_to,OLD.ownership_percent,OLD.exposure_amount,OLD.currency,OLD.artifact_id,OLD.parser_version,OLD.source_cell,OLD.ingested_at)
 THEN RAISE EXCEPTION 'Append an exposure correction; original evidence is immutable'; END IF;
 RETURN NEW;
END $guard$;
DROP TRIGGER IF EXISTS exposure_revision_guard ON market.exposure_relationships;
CREATE TRIGGER exposure_revision_guard BEFORE UPDATE ON market.exposure_relationships FOR EACH ROW EXECUTE FUNCTION market.protect_exposure_revision();
REVOKE ALL ON FUNCTION market.protect_exposure_revision() FROM PUBLIC,anon,authenticated;

INSERT INTO market.quantitative_models(id,version,definition) VALUES('probabilistic-forecast','institutional-intelligence-v1','{"id": "probabilistic-forecast", "name": "Probabilistic Forecast", "version": "institutional-intelligence-v1", "purpose": "Dated source-linked levels or returns, availability vintages, target-specific units, >=20 non-overlapping rolling origins before validated forecasts.", "inputRequirements": "Dated source-linked levels or returns, availability vintages, target-specific units, >=20 non-overlapping rolling origins before validated forecasts.", "outputSchema": "institutional-result-v1", "owner": "Python Engine", "deploymentStatus": "research", "validationStatus": "per-input validation required", "lastValidationAt": null, "limitations": "No institutional accuracy claim. Numerical tests do not establish empirical calibration."}'::jsonb) ON CONFLICT DO NOTHING;

INSERT INTO market.quantitative_models(id,version,definition) VALUES('monte-carlo','institutional-intelligence-v1','{"id": "monte-carlo", "name": "Monte Carlo", "version": "institutional-intelligence-v1", "purpose": "Strictly aligned sourced returns, >=120 sessions, owned weights, explicit price-only/total-return basis, deterministic seed.", "inputRequirements": "Strictly aligned sourced returns, >=120 sessions, owned weights, explicit price-only/total-return basis, deterministic seed.", "outputSchema": "institutional-result-v1", "owner": "Python Engine", "deploymentStatus": "research", "validationStatus": "per-input validation required", "lastValidationAt": null, "limitations": "No institutional accuracy claim. Numerical tests do not establish empirical calibration."}'::jsonb) ON CONFLICT DO NOTHING;

INSERT INTO market.quantitative_models(id,version,definition) VALUES('liquidity','institutional-intelligence-v1','{"id": "liquidity", "name": "Liquidity", "version": "institutional-intelligence-v1", "purpose": "Observed volume and raw close, dated provenance, security status, explicit participation; missing volume is not zero.", "inputRequirements": "Observed volume and raw close, dated provenance, security status, explicit participation; missing volume is not zero.", "outputSchema": "institutional-result-v1", "owner": "Python Engine", "deploymentStatus": "research", "validationStatus": "per-input validation required", "lastValidationAt": null, "limitations": "No institutional accuracy claim. Numerical tests do not establish empirical calibration."}'::jsonb) ON CONFLICT DO NOTHING;

INSERT INTO market.quantitative_models(id,version,definition) VALUES('exposure-graph','institutional-intelligence-v1','{"id": "exposure-graph", "name": "Exposure Graph", "version": "institutional-intelligence-v1", "purpose": "Verified dated edges, source lineage, typed entities; propagation requires explicit user coefficients.", "inputRequirements": "Verified dated edges, source lineage, typed entities; propagation requires explicit user coefficients.", "outputSchema": "institutional-result-v1", "owner": "Python Engine", "deploymentStatus": "research", "validationStatus": "per-input validation required", "lastValidationAt": null, "limitations": "No institutional accuracy claim. Numerical tests do not establish empirical calibration."}'::jsonb) ON CONFLICT DO NOTHING;

INSERT INTO market.quantitative_models(id,version,definition) VALUES('research-case','institutional-intelligence-v1','{"id": "research-case", "name": "Research Case", "version": "institutional-intelligence-v1", "purpose": "Canonical company evidence and explicit scenario assumptions; completeness is not quality.", "inputRequirements": "Canonical company evidence and explicit scenario assumptions; completeness is not quality.", "outputSchema": "institutional-result-v1", "owner": "Python Engine", "deploymentStatus": "research", "validationStatus": "per-input validation required", "lastValidationAt": null, "limitations": "No institutional accuracy claim. Numerical tests do not establish empirical calibration."}'::jsonb) ON CONFLICT DO NOTHING;

INSERT INTO market.quantitative_models(id,version,definition) VALUES('relationship-draft','institutional-intelligence-v1','{"id": "relationship-draft", "name": "Relationship Draft", "version": "institutional-intelligence-v1", "purpose": "Literal disclosed relationship rows with dates and source cells; review is mandatory.", "inputRequirements": "Literal disclosed relationship rows with dates and source cells; review is mandatory.", "outputSchema": "institutional-result-v1", "owner": "Python Engine", "deploymentStatus": "research", "validationStatus": "per-input validation required", "lastValidationAt": null, "limitations": "No institutional accuracy claim. Numerical tests do not establish empirical calibration."}'::jsonb) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION market.institutional_graph_rows(cutoff date,symbol text DEFAULT NULL)
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,market AS $graph$
 WITH eligible AS (
  SELECT * FROM market.eligible_exposure_relationships WHERE effective_date<=cutoff AND available_date<=cutoff AND (valid_to IS NULL OR valid_to>=cutoff)
 ), neighbors AS (
  SELECT from_entity AS entity FROM eligible WHERE to_entity='security:NSE:'||symbol
  UNION SELECT to_entity FROM eligible WHERE from_entity='security:NSE:'||symbol
  UNION SELECT 'security:NSE:'||symbol
 ) SELECT jsonb_build_object('id',id,'from',from_entity,'to',to_entity,'fromType',from_type,'toType',to_type,
  'type',relation_type,'effectiveDate',effective_date,'availableAt',available_date,'validTo',valid_to,
  'ownershipPercent',ownership_percent,'amount',exposure_amount,'currency',currency,'verification',verification,
  'sourceUrl',source_url,'sha256',sha256,'artifactId',artifact_id,'sourceCell',jsonb_build_object('table',source_cell->'table','row',source_cell->'row','columns',source_cell->'columns'),'parserVersion',parser_version)
 FROM eligible WHERE symbol IS NULL OR from_entity IN(SELECT entity FROM neighbors) OR to_entity IN(SELECT entity FROM neighbors)
 ORDER BY effective_date DESC,id LIMIT 501
 $graph$;
REVOKE ALL ON FUNCTION market.institutional_graph_rows(date,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION market.quantitative_dashboard()
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,market AS $dashboard$
 SELECT jsonb_build_object('modelId',m.id,'version',m.version,'status',m.status,'definition',m.definition,
  'calculations',count(r.*),'attempts',coalesce(sum(r.attempts),0),'failureAttempts',coalesce(sum(r.failure_attempts),0),'failureRate',CASE WHEN sum(r.attempts)>0 THEN sum(r.failure_attempts)::numeric/sum(r.attempts) ELSE NULL END,'failures',count(*) FILTER(WHERE r.status<>'success'),
  'lastValidation',max(r.last_at) FILTER(WHERE r.summary ? 'coverage'),'lastSuccess',max(r.last_at) FILTER(WHERE r.status='success'),'lastFailure',max(r.last_at) FILTER(WHERE r.status<>'success'),
  'averageRuntimeMs',avg(r.runtime_ms),'latestValidation',(SELECT summary FROM market.quantitative_runs latest WHERE latest.model_id=m.id AND latest.model_version=m.version AND latest.status='success' ORDER BY last_at DESC LIMIT 1),
  'calibrationTrend',coalesce((SELECT jsonb_agg(item) FROM (SELECT jsonb_build_object('at',last_at,'validation',summary->'coverage','status',summary->>'validationStatus') item FROM market.quantitative_runs recent WHERE recent.model_id=m.id AND recent.model_version=m.version AND recent.status='success' ORDER BY last_at DESC LIMIT 30) v),'[]'::jsonb))
 FROM market.quantitative_models m LEFT JOIN market.quantitative_runs r ON r.model_id=m.id AND r.model_version=m.version
 GROUP BY m.id,m.version,m.status,m.definition
 $dashboard$;
REVOKE ALL ON FUNCTION market.quantitative_dashboard() FROM PUBLIC,anon,authenticated;

INSERT INTO market.quantitative_models(id,version,definition) VALUES('portfolio-liquidity','institutional-intelligence-v1','{"id": "portfolio-liquidity", "name": "Portfolio Liquidity", "version": "institutional-intelligence-v1", "purpose": "Owned quantities, sourced closes/volume, active status, explicit participation and liquidation sessions; optimization uses server-owned covariance.", "inputRequirements": "Owned quantities, sourced closes/volume, active status, explicit participation and liquidation sessions; optimization uses server-owned covariance.", "outputSchema": "institutional-result-v1", "owner": "Python Engine", "deploymentStatus": "research", "validationStatus": "per-input validation required", "lastValidationAt": null, "limitations": "No institutional accuracy claim. Numerical tests do not establish empirical calibration."}'::jsonb) ON CONFLICT DO NOTHING;

INSERT INTO market.quantitative_models(id,version,definition) VALUES('optimization','investment-intelligence-v1','{"id": "optimization", "name": "Optimization", "version": "investment-intelligence-v1", "purpose": "Existing Phase 2 deterministic source-backed research", "owner": "Python Engine", "inputRequirements": "Existing Phase 2 strict source, alignment, unit and numerical guards", "outputSchema": "investment-result-v1", "deploymentStatus": "research", "limitations": "Algebraic and numerical validation are not empirical forecast calibration. Legacy Risk Intelligence retains its own evidence and model version metadata."}'::jsonb) ON CONFLICT DO NOTHING;

INSERT INTO market.quantitative_models(id,version,definition) VALUES('backtest','investment-intelligence-v1','{"id": "backtest", "name": "Backtest", "version": "investment-intelligence-v1", "purpose": "Existing Phase 2 deterministic source-backed research", "owner": "Python Engine", "inputRequirements": "Existing Phase 2 strict source, alignment, unit and numerical guards", "outputSchema": "investment-result-v1", "deploymentStatus": "research", "limitations": "Algebraic and numerical validation are not empirical forecast calibration. Legacy Risk Intelligence retains its own evidence and model version metadata."}'::jsonb) ON CONFLICT DO NOTHING;

INSERT INTO market.quantitative_models(id,version,definition) VALUES('factor-model','investment-intelligence-v1','{"id": "factor-model", "name": "Factor Model", "version": "investment-intelligence-v1", "purpose": "Existing Phase 2 deterministic source-backed research", "owner": "Python Engine", "inputRequirements": "Existing Phase 2 strict source, alignment, unit and numerical guards", "outputSchema": "investment-result-v1", "deploymentStatus": "research", "limitations": "Algebraic and numerical validation are not empirical forecast calibration. Legacy Risk Intelligence retains its own evidence and model version metadata."}'::jsonb) ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS quantitative_runs_model_time ON market.quantitative_runs(model_id,model_version,last_at DESC);

CREATE OR REPLACE FUNCTION market.delete_quantitative_snapshot(owner uuid,hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,market AS $remove$
DECLARE dataset text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext(owner::text),77128);
 DELETE FROM market.quantitative_snapshots WHERE user_id=owner AND input_hash=hash RETURNING data_hash INTO dataset;
 IF NOT FOUND THEN RETURN NULL; END IF;
 DELETE FROM market.quantitative_datasets d WHERE d.user_id=owner AND d.data_hash=dataset
 AND NOT EXISTS(SELECT 1 FROM market.quantitative_snapshots s WHERE s.user_id=d.user_id AND s.data_hash=d.data_hash);
 RETURN jsonb_build_object('inputHash',hash,'removed',true);
END $remove$;
REVOKE ALL ON FUNCTION market.delete_quantitative_snapshot(uuid,text) FROM PUBLIC,anon,authenticated;
