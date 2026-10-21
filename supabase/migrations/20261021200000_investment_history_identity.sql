-- One artifact contains many observation years of the same series and vintage.
-- Preserve original records while allowing every distinct observation date.
DO $identity$
DECLARE old_key record;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='market.investment_observations'::regclass
   AND conname='investment_observations_revision_key') THEN
  ALTER TABLE market.investment_observations ADD CONSTRAINT investment_observations_revision_key
   UNIQUE(kind,natural_key,observed_date,available_date,artifact_id,parser_version);
 END IF;
 FOR old_key IN SELECT conname FROM pg_constraint
  WHERE conrelid='market.investment_observations'::regclass AND contype='u'
   AND pg_get_constraintdef(oid)='UNIQUE (kind, natural_key, available_date, artifact_id, parser_version)'
 LOOP
  EXECUTE format('ALTER TABLE market.investment_observations DROP CONSTRAINT %I',old_key.conname);
 END LOOP;
END $identity$;
