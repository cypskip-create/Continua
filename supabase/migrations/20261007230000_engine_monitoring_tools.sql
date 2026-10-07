ALTER TABLE market.engine_monitor_rules DROP CONSTRAINT IF EXISTS engine_monitor_rules_kind_check;
ALTER TABLE market.engine_monitor_rules ADD CONSTRAINT engine_monitor_rules_kind_check CHECK (kind IN ('material_change','price_below','price_above','debt_above','revenue_growth_below','earnings_growth_below','cash_conversion_below','dividend_payout_above','quote_age_above'));
