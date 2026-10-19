BEGIN;
-- Unlinked legacy files retain an independent receipt; do not invent issuer,
-- source URL, extraction, licensing or publication eligibility for them.
CREATE TABLE IF NOT EXISTS scraping.uncatalogued_raw_archive (
 original_id text PRIMARY KEY,
 legacy_key text NOT NULL,
 original_updated_at text NOT NULL,
 object_uri text NOT NULL CHECK(object_uri LIKE 'r2://continua-financial-documents/%'),
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 1 AND 52428800),
 state text NOT NULL CHECK(state IN ('verified','deleted','retry')),
 verified_at timestamptz,
 deleted_at timestamptz,
 retry_at timestamptz,
 CHECK(object_uri LIKE '%/' || sha256 || '.%')
);
ALTER TABLE scraping.uncatalogued_raw_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON scraping.uncatalogued_raw_archive FROM PUBLIC,anon,authenticated;
COMMIT;
