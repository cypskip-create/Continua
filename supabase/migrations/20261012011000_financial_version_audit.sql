-- Record future canonical changes without inventing historical amendment dates.
CREATE TABLE IF NOT EXISTS market.financial_version_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 table_name text NOT NULL,
 period_id text NOT NULL,
 security_id text,
 operation text NOT NULL CHECK(operation IN ('INSERT','UPDATE','DELETE','BASELINE')),
 before_payload jsonb,
 after_payload jsonb,
 recorded_at timestamptz NOT NULL DEFAULT now(),
 transaction_id bigint NOT NULL DEFAULT txid_current()
);
CREATE INDEX IF NOT EXISTS financial_version_audit_security ON market.financial_version_audit(security_id,recorded_at DESC,id DESC);
ALTER TABLE market.financial_version_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON market.financial_version_audit FROM anon,authenticated;
CREATE OR REPLACE FUNCTION market.capture_financial_version() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,market AS $$
DECLARE prior jsonb; current_row jsonb; pid text; sid text;
BEGIN
 IF TG_OP='UPDATE' AND to_jsonb(OLD)=to_jsonb(NEW) THEN RETURN NEW; END IF;
 IF TG_OP IN ('UPDATE','DELETE') THEN prior=to_jsonb(OLD); END IF;
 IF TG_OP IN ('INSERT','UPDATE') THEN current_row=to_jsonb(NEW); END IF;
 pid=COALESCE(current_row,prior)->>CASE WHEN TG_TABLE_NAME='financial_periods' THEN 'id' ELSE 'period_id' END;
 IF TG_TABLE_NAME='financial_periods' THEN sid=COALESCE(current_row,prior)->>'security_id';
 ELSE SELECT security_id INTO sid FROM market.financial_periods WHERE id=pid; END IF;
 INSERT INTO market.financial_version_audit(table_name,period_id,security_id,operation,before_payload,after_payload)
 VALUES(TG_TABLE_NAME,pid,sid,TG_OP,prior,current_row);
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['financial_periods','income_statements','balance_sheets','cash_flow_statements'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS financial_version_capture ON market.%I',tab);
  EXECUTE format('CREATE TRIGGER financial_version_capture AFTER INSERT OR UPDATE OR DELETE ON market.%I FOR EACH ROW EXECUTE FUNCTION market.capture_financial_version()',tab);
 END LOOP;
END $$;
-- A baseline records what is known at deployment, not when it was first filed.
INSERT INTO market.financial_version_audit(table_name,period_id,security_id,operation,after_payload)
SELECT 'financial_periods',p.id,p.security_id,'BASELINE',to_jsonb(p) FROM market.financial_periods p
WHERE NOT EXISTS(SELECT 1 FROM market.financial_version_audit a WHERE a.table_name='financial_periods' AND a.period_id=p.id);
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['income_statements','balance_sheets','cash_flow_statements'] LOOP
  EXECUTE format('INSERT INTO market.financial_version_audit(table_name,period_id,security_id,operation,after_payload)
    SELECT %L,s.period_id,p.security_id,''BASELINE'',to_jsonb(s) FROM market.%I s
    JOIN market.financial_periods p ON p.id=s.period_id
    WHERE NOT EXISTS(SELECT 1 FROM market.financial_version_audit a WHERE a.table_name=%L AND a.period_id=s.period_id)',tab,tab,tab);
 END LOOP;
END $$;
