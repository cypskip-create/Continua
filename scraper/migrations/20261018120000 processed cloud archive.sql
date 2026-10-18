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
-- Preserve every verified extraction version, rather than only the latest
-- pointer in raw_artifacts.metadata. This is a receipt, never a purge permit.
CREATE TABLE IF NOT EXISTS scraping.extraction_cloud_archive (
 extraction_id bigint NOT NULL REFERENCES scraping.extractions(id) ON DELETE CASCADE,
 artifact_id bigint NOT NULL REFERENCES scraping.raw_artifacts(id) ON DELETE CASCADE,
 object_uri text NOT NULL CHECK(object_uri LIKE 'r2://continua-financial-documents/extractions/%'),
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 raw_object_uri text NOT NULL CHECK(raw_object_uri LIKE 'r2://continua-financial-documents/%'),
 format text NOT NULL CHECK(format='gzip-json-v1'),
 verified_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(extraction_id,sha256),
 CHECK(object_uri LIKE '%/' || sha256 || '.json.gz')
);
ALTER TABLE scraping.extraction_cloud_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON scraping.extraction_cloud_archive FROM PUBLIC,anon,authenticated;
COMMIT;
