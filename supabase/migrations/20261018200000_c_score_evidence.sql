-- Missing evidence must be representable without fabricated neutral scores.
ALTER TABLE market.afri_scores
 ALTER COLUMN afri_score DROP NOT NULL,
 ALTER COLUMN afri_value DROP NOT NULL,
 ALTER COLUMN afri_growth DROP NOT NULL,
 ALTER COLUMN afri_health DROP NOT NULL,
 ALTER COLUMN afri_income DROP NOT NULL,
 ALTER COLUMN afri_risk DROP NOT NULL,
 ALTER COLUMN afri_quality DROP NOT NULL,
 ALTER COLUMN afri_momentum DROP NOT NULL;
COMMENT ON TABLE market.afri_scores IS 'Versioned Continua C score; legacy wire aliases retained. Unknown factors remain NULL; methodology and evidence are in inputs.';
