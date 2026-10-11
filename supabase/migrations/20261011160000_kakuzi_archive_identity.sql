-- Restore the real issuer already present in the app's NSE directory.
-- Identity verified against https://www.kakuzi.co.ke/ (NSE: KUKZ)
-- and the official NSE Kakuzi audited FY2017 group report.
-- No synthetic price, share-count or financial figures are seeded.
INSERT INTO market.companies(id,name,website)
VALUES('NSE:company:KUKZ','Kakuzi Plc','https://www.kakuzi.co.ke/')
ON CONFLICT(id) DO NOTHING;
-- Replace only the observed ticker-only placeholder, never another named issuer.
UPDATE market.companies SET name='Kakuzi Plc',website='https://www.kakuzi.co.ke/',updated_at=now()
WHERE id='NSE:company:KUKZ' AND name='KUKZ';
INSERT INTO market.securities(id,symbol,exchange,company_id,currency,status)
VALUES('NSE:KUKZ','KUKZ','NSE','NSE:company:KUKZ','KES','active')
ON CONFLICT(id) DO NOTHING;
