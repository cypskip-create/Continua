-- Preserve legacy rows; do not declare untraceable history to be verified.
ALTER TABLE market.candles ADD COLUMN IF NOT EXISTS source_url text;
COMMENT ON COLUMN market.candles.source_url IS 'Observed publisher transport for this bar. NULL legacy/mock rows are excluded from production history reads.';
