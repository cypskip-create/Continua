BEGIN;
CREATE TABLE IF NOT EXISTS scraping.cloud_migration_transfer_days (
 day date PRIMARY KEY,
 reserved_bytes bigint NOT NULL CHECK(reserved_bytes>=0)
);
ALTER TABLE scraping.cloud_migration_transfer_days ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON scraping.cloud_migration_transfer_days FROM PUBLIC,anon,authenticated;
-- Only small immutable object receipts live here. Payload retirement is a
-- separate cutover after every reader supports the verified private objects.
CREATE TABLE IF NOT EXISTS scraping.processed_cloud_archive (
 extraction_id bigint NOT NULL,
 processor_version text NOT NULL,
 processed_at timestamptz NOT NULL,
 object_uri text NOT NULL CHECK(object_uri LIKE 'r2://continua-financial-documents/processed/%'),
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 1 AND 52428800),
 verified_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(extraction_id,processor_version),
 FOREIGN KEY(extraction_id,processor_version) REFERENCES scraping.processed_research(extraction_id,processor_version) ON DELETE CASCADE
);
ALTER TABLE scraping.processed_cloud_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON scraping.processed_cloud_archive FROM PUBLIC,anon,authenticated;
COMMIT;
