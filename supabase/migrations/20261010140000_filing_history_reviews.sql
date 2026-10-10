-- Retain provenance and previous values for every reviewed comparative column.
CREATE TABLE IF NOT EXISTS market.filing_history_reviews (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  candidate_id bigint NOT NULL REFERENCES market.financial_statement_candidates(id),
  period_id text NOT NULL REFERENCES market.financial_periods(id),
  column_index integer NOT NULL CHECK(column_index>=0),
  statement_type text NOT NULL CHECK(statement_type IN ('income','balance','cashflow')),
  source_url text NOT NULL,
  source_page integer NOT NULL CHECK(source_page>0),
  review_note text NOT NULL,
  reviewed_values jsonb NOT NULL,
  previous_values jsonb,
  reviewed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS filing_history_period_idx ON market.filing_history_reviews(period_id);
ALTER TABLE market.filing_history_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON market.filing_history_reviews FROM anon,authenticated;
