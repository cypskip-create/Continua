package marketdata

import (
	"context"
	"continua/backend/internal/auth"
	"continua/backend/internal/maintenance"
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// Opt-in only: never use DATABASE_URL or an existing user's Supabase database.
func TestPostgresOwnedFixtureMigrationAndAtomicQuoteOutbox(t *testing.T) {
	raw := os.Getenv("NATIVE_POSTGRES_FIXTURE_URL")
	if raw == "" {
		t.Skip("Dedicated disposable PostgreSQL fixture is not configured")
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme != "postgresql" || parsed.Hostname() != "127.0.0.1" || parsed.Port() == "" || parsed.Path != "/continua_native_fixture" || parsed.Query().Get("application_name") != "continua-native-fixture" {
		t.Fatal("refusing non-fixture PostgreSQL destination")
	}
	store, err := Open(raw)
	if err != nil {
		t.Fatal("fixture connection rejected")
	}
	defer store.DB.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	var empty bool
	if err = store.DB.QueryRowContext(ctx, `SELECT current_database()='continua_native_fixture' AND to_regnamespace('market') IS NULL AND to_regnamespace('supabase_migrations') IS NULL`).Scan(&empty); err != nil || !empty {
		t.Fatal("fixture must be a fresh empty dedicated database")
	}
	base, err := os.ReadFile(filepath.Join("..", "..", "..", "supabase", "migrations", "030_market_schema.sql"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = store.DB.ExecContext(ctx, string(base)); err != nil {
		t.Fatal(err)
	}
	readiness, err := os.ReadFile(filepath.Join("..", "..", "..", "supabase", "migrations", "031_production_readiness.sql"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = store.DB.ExecContext(ctx, string(readiness)); err != nil {
		t.Fatal(err)
	}
	verifyIngestionAuditPostgresFixture(t, store, ctx)
	fixtureKey, err := maintenance.CreateKey(ctx, store.DB, "Disposable fixture data key", 120)
	if err != nil {
		t.Fatal("fixture key creation failed")
	}
	keyHash, err := auth.HashKey(fixtureKey.PlaintextKey)
	if err != nil {
		t.Fatal("fixture hashing failed")
	}
	storedKey, err := store.FindActiveKey(ctx, keyHash)
	if err != nil || storedKey == nil || storedKey.ID != fixtureKey.ID || storedKey.RateLimitPerMin != 120 {
		t.Fatal("fixture key lookup contract failed")
	}
	headers := http.Header{"X-Api-Key": []string{fixtureKey.PlaintextKey}}
	authenticator := auth.New(store, true)
	if _, err = authenticator.Authenticate(ctx, headers); err != nil {
		t.Fatal("fixture key authentication failed")
	}
	if err = maintenance.RevokeKey(ctx, store.DB, fixtureKey.ID); err != nil {
		t.Fatal("fixture key revoke failed")
	}
	if _, err = auth.New(store, true).Authenticate(ctx, headers); err != auth.ErrInvalid {
		t.Fatal("new API instance accepted revoked key")
	}
	if _, err = authenticator.Authenticate(ctx, headers); err != nil {
		t.Fatal("existing documented short-lived auth cache contract changed")
	}
	if _, err = store.DB.ExecContext(ctx, `CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE SCHEMA supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,name text,statements text[]);`); err != nil {
		t.Fatal(err)
	}
	migration, err := maintenance.ReadMigration(filepath.Join("..", "..", ".."), "backend/migration/20261013090000 native research refresh outbox.sql")
	if err != nil {
		t.Fatal(err)
	}
	checks, err := maintenance.ProtectionChecks(migration.Version)
	if err != nil {
		t.Fatal(err)
	}
	result, err := maintenance.ApplyMigration(ctx, store.DB, migration, false, checks)
	if err != nil || !result.Validated || result.Applied {
		t.Fatal("rolled-back validation failed", err)
	}
	if err = store.DB.QueryRowContext(ctx, `SELECT to_regclass('market.native_research_refresh') IS NULL`).Scan(&empty); err != nil || !empty {
		t.Fatal("validation leaked DDL")
	}
	result, err = maintenance.ApplyMigration(ctx, store.DB, migration, true, checks)
	if err != nil || !result.Applied {
		t.Fatal("explicit fixture migration failed", err)
	}
	result, err = maintenance.ApplyMigration(ctx, store.DB, migration, false, checks)
	if err != nil || !result.AlreadyApplied {
		t.Fatal("migration retry failed", err)
	}
	if err = store.UpsertCompany(ctx, CompanyInput{ID: "NSE:company:KCB", Name: "Fixture KCB"}); err != nil {
		t.Fatal(err)
	}
	if err = store.UpsertSecurity(ctx, SecurityInput{ID: "NSE:KCB", Symbol: "KCB", Exchange: "NSE", CompanyID: "NSE:company:KCB", Currency: "KES", Status: "active"}); err != nil {
		t.Fatal(err)
	}
	store.DurableQuoteRefresh = true
	verifyFinancialPostgresFixture(t, store, ctx)
	verifyQuoteCandidatePostgresFixture(t, store, ctx)
	if candidates, err := store.PublishedQuoteCandidates(ctx); err != nil || len(candidates) != 0 {
		t.Fatal("empty approved-source quote query failed against PostgreSQL", err)
	}
	q := validQuote()
	var now time.Time
	if err = store.DB.QueryRowContext(ctx, `SELECT now()`).Scan(&now); err != nil {
		t.Fatal(err)
	}
	quoteBase := now.UTC().Add(-3 * time.Second).Truncate(time.Second)
	q.Timestamp = quoteBase.Add(123456789 * time.Nanosecond).Format(time.RFC3339Nano)
	rows, err := store.UpsertQuotesBatch(ctx, []QuoteInput{q}, now)
	if err != nil || len(rows) != 1 {
		t.Fatal("actual quote SQL failed", err)
	}
	var millisecondPrecision bool
	if err = store.DB.QueryRowContext(ctx, `SELECT event_timestamp=date_trunc('milliseconds',event_timestamp) FROM market.live_quotes WHERE security_id='NSE:KCB'`).Scan(&millisecondPrecision); err != nil || !millisecondPrecision {
		t.Fatal("stored quote timestamp disagrees with research wire precision", err)
	}
	rows, err = store.UpsertQuotesBatch(ctx, []QuoteInput{q}, now)
	if err != nil || len(rows) != 0 {
		t.Fatal("unchanged quote produced duplicate event", err)
	}
	var version int
	if err = store.DB.QueryRowContext(ctx, `SELECT requested_version FROM market.native_research_refresh WHERE security_id='NSE:KCB'`).Scan(&version); err != nil || version != 1 {
		t.Fatal("outbox duplicated unchanged quote", err)
	}
	q.Timestamp = quoteBase.Add(time.Second).Format(time.RFC3339Nano)
	rows, err = store.UpsertQuotesBatch(ctx, []QuoteInput{q}, now)
	if err != nil || len(rows) != 1 {
		t.Fatal("new dated quote not persisted", err)
	}
	if _, err = store.DB.ExecContext(ctx, `ALTER TABLE market.native_research_refresh ADD CONSTRAINT fixture_refresh_failure CHECK(requested_version<3)`); err != nil {
		t.Fatal(err)
	}
	q.Timestamp = quoteBase.Add(2 * time.Second).Format(time.RFC3339Nano)
	if _, err = store.UpsertQuotesBatch(ctx, []QuoteInput{q}, now); err == nil {
		t.Fatal("expected atomic outbox failure")
	}
	var stored json.RawMessage
	if err = store.DB.QueryRowContext(ctx, `SELECT row_to_json(q) FROM market.live_quotes q WHERE security_id='NSE:KCB'`).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	var value struct {
		Timestamp string `json:"event_timestamp"`
	}
	if json.Unmarshal(stored, &value) != nil {
		t.Fatal("invalid stored quote")
	}
	at, err := time.Parse(time.RFC3339Nano, value.Timestamp)
	if err != nil || !at.Equal(quoteBase.Add(time.Second)) {
		t.Fatal("failed outbox partially committed quote")
	}
	verifyResearchPostgresFixture(t, store, ctx)
	verifyImportPostgresFixture(t, store, ctx)
	if _, err = store.DB.ExecContext(ctx, `ALTER TABLE market.native_research_refresh DROP CONSTRAINT fixture_refresh_failure;
	 INSERT INTO market.native_research_refresh(security_id,symbol,lease_token,lease_until)
	 VALUES('NSE:KCB','KCB','fixture-lease',now()+interval '1 minute')
	 ON CONFLICT(security_id) DO UPDATE SET lease_token=EXCLUDED.lease_token,lease_until=EXCLUDED.lease_until`); err != nil {
		t.Fatal(err)
	}
	var expected int64
	if err = store.DB.QueryRowContext(ctx, `SELECT count(*) FROM market.securities WHERE exchange='NSE' AND status<>'delisted'`).Scan(&expected); err != nil {
		t.Fatal(err)
	}
	queued, err := store.QueueRegistryRefresh(ctx, "NSE")
	if err != nil || queued != expected {
		t.Fatal("full active registry was not queued", queued, expected, err)
	}
	var lease string
	if err = store.DB.QueryRowContext(ctx, `SELECT lease_token FROM market.native_research_refresh WHERE security_id='NSE:KCB'`).Scan(&lease); err != nil || lease != "fixture-lease" {
		t.Fatal("registry refresh stole active lease", err)
	}
}
