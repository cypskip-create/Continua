-- A report may disclose revenue/profit but no EPS, or FCF but no CFO.
-- Missing is not zero and must not prevent the reported fields being used.
ALTER TABLE market.income_statements ALTER COLUMN eps DROP NOT NULL;
ALTER TABLE market.cash_flow_statements ALTER COLUMN operating_cash_flow DROP NOT NULL;
