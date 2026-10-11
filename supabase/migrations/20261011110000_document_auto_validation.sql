-- Private, versioned validation outcomes. Unsupported layouts remain in review.
CREATE TABLE IF NOT EXISTS market.document_validations (
  extraction_id bigint NOT NULL REFERENCES scraping.extractions(id),
  validator_version text NOT NULL,
  artifact_sha256 text NOT NULL CHECK (artifact_sha256 ~ '^[a-f0-9]{64}$'),
  source_url text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('published','review')),
  reason text NOT NULL,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  validated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (extraction_id,validator_version)
);
ALTER TABLE market.document_validations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON market.document_validations FROM anon,authenticated;
COMMENT ON TABLE market.document_validations IS 'Deterministic native-layout validation and publication audit. No OCR-confidence auto-approval.';
