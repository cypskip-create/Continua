-- Apply ONLY during the explicitly approved production cutover window, after
-- pausing both Render workers and existing collection workflow opt-ins.
-- Preserve a fresh source ACL backup first. This does not delete source data.
-- Old browser bundles must not continue writing into the retired source.
BEGIN;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON ALL TABLES IN SCHEMA public,market,scraping FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public,market,scraping FROM PUBLIC,anon,authenticated;
-- PostgreSQL also revokes the corresponding column privileges. Verify those
-- effective privileges during the rehearsal rather than relying on table ACLs.
COMMIT;
