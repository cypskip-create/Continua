-- Remove unsupported instruments from active discovery without destroying
-- holdings, transactions or filing provenance that reference their identifiers.
BEGIN;
UPDATE market.securities SET status='delisted', updated_at=now()
WHERE exchange <> 'NSE';
UPDATE market.securities s SET status='delisted', updated_at=now()
FROM market.companies c
WHERE c.id=s.company_id AND s.exchange='NSE'
  AND lower(c.name) LIKE 'safaricom%' AND s.symbol <> 'SCOM';
DELETE FROM market.live_quotes q USING market.securities s
WHERE q.security_id=s.id AND s.status='delisted';
COMMIT;
