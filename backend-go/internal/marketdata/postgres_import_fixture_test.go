package marketdata

import (
	"context"
	"continua/backend/internal/maintenance"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Called only by the fresh, localhost-only disposable fixture. No DATABASE_URL,
// source fetch, R2 request, production registry or user account is used.
func verifyImportPostgresFixture(t *testing.T, store *Store, ctx context.Context) {
	t.Helper()
	exec := func(query string, args ...any) {
		t.Helper()
		if _, err := store.DB.ExecContext(ctx, query, args...); err != nil {
			t.Fatal("native import fixture setup failed", err)
		}
	}
	exec(`CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean)`)
	for _, relative := range []string{
		"supabase/migrations/032 mansa integration followthrough.sql",
		"supabase/migrations/20261007210000_market_research_records.sql",
		"supabase/migrations/20261010220000_historical_document_queue.sql",
		"supabase/migrations/20261011211500_candle_provenance.sql",
	} {
		body, err := os.ReadFile(filepath.Join("..", "..", "..", filepath.FromSlash(relative)))
		if err != nil {
			t.Fatal(err)
		}
		exec(string(body))
	}
	migration, err := maintenance.ReadMigration(filepath.Join("..", "..", ".."), "backend/migration/20261015110000 native observed daily closes.sql")
	if err != nil {
		t.Fatal(err)
	}
	checks, err := maintenance.ProtectionChecks(migration.Version)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = maintenance.ApplyMigration(ctx, store.DB, migration, true, checks); err != nil {
		t.Fatal("native close migration failed", err)
	}
	var now time.Time
	if err = store.DB.QueryRowContext(ctx, `SELECT now()`).Scan(&now); err != nil {
		t.Fatal(err)
	}
	date := now.UTC().Add(-48 * time.Hour).Format("2006-01-02")
	exec(`INSERT INTO scraping.sources(id,name,adapter,enabled,redistribution_allowed,config) VALUES('fixture-closes','Fixture closes','mystocks',true,true,'{"permissionReference":"synthetic-fixture-only","closeMappingApproved":"publisher-daily-close-v1","historyAdjustment":"unknown"}')`)
	var artifact, extraction int64
	if err = store.DB.QueryRowContext(ctx, `INSERT INTO scraping.raw_artifacts(source_id,adapter,sha256,document_url,source_url,storage_path,crawler_version) VALUES('fixture-closes','mystocks',repeat('b',64),'https://live.mystocks.co.ke/stock=KCB?historical','https://live.mystocks.co.ke/stock=KCB?historical','r2://continua-financial-documents/fixture/b','fixture') RETURNING id`).Scan(&artifact); err != nil {
		t.Fatal(err)
	}
	tables, _ := json.Marshal([]any{map[string]any{"kind": "historical_close_candidate", "date": date, "close": 90, "volume": nil}})
	if err = store.DB.QueryRowContext(ctx, `INSERT INTO scraping.extractions(artifact_id,method,parser_version,tables,entity,needs_review) VALUES($1,'json','fixture',$2::jsonb,'{"ticker":"KCB","exchange":"NSE"}',true) RETURNING id`, artifact, string(tables)).Scan(&extraction); err != nil {
		t.Fatal(err)
	}
	candidates, err := store.ObservedCloseCandidates(ctx, 0, 10)
	if err != nil || len(candidates) != 1 {
		t.Fatal("actual close source query failed", err)
	}
	var candidate struct {
		Basis string `json:"basis"`
	}
	if json.Unmarshal(candidates[0], &candidate) != nil || len(candidate.Basis) != 32 {
		t.Fatal("close version basis unavailable")
	}
	observation := ObservedClose{SecurityID: "NSE:KCB", Symbol: "KCB", SourceID: "fixture-closes", Date: date, Close: 90, Adjustment: "unknown", ArtifactID: artifact, ExtractionID: extraction, SourceURL: "https://live.mystocks.co.ke/stock=KCB?historical"}
	if err = store.PublishObservedCloses(ctx, []ObservedClose{observation}, now); err != nil {
		t.Fatal("literal sourced close publication failed", err)
	}
	corrupt := observation
	corrupt.Close = 91
	if store.PublishObservedCloses(ctx, []ObservedClose{corrupt}, now) == nil {
		t.Fatal("fabricated close detached from extraction was accepted")
	}
	history, err := store.DailyCloseHistory(ctx, "NSE:KCB", now.Add(-72*time.Hour), now)
	if err != nil || len(history) != 1 || !strings.Contains(string(history[0]), `"volume":null`) || !strings.Contains(string(history[0]), `"open":null`) {
		t.Fatal("close-only missing OHLC/volume contract lost", err)
	}
	if err = store.CompleteObservedCloseExtraction(ctx, extraction, "fixture-closes", candidate.Basis); err != nil {
		t.Fatal("durable close completion failed", err)
	}
	candidates, err = store.ObservedCloseCandidates(ctx, 0, 10)
	if err != nil || len(candidates) != 0 {
		t.Fatal("completed extraction was not suppressed", err)
	}
	exec(`UPDATE scraping.sources SET redistribution_allowed=false WHERE id='fixture-closes'`)
	if store.PublishObservedCloses(ctx, []ObservedClose{observation}, now) == nil {
		t.Fatal("revoked source retained publication rights")
	}
	history, err = store.DailyCloseHistory(ctx, "NSE:KCB", now.Add(-72*time.Hour), now)
	if err != nil || len(history) != 0 {
		t.Fatal("revoked source remained publicly readable", err)
	}
	// Reviewed full OHLCV imports remain separate from the close-only table.
	row := HistoricalObservation{Symbol: "KCB", Date: date, Currency: "KES", Open: 88, High: 92, Low: 87, Close: 90, Volume: 100, SourceURL: "https://www.nse.co.ke/fixture-report.pdf", PermissionReference: "synthetic-fixture-only", Adjustment: "unadjusted"}
	input, _ := json.Marshal([]HistoricalObservation{row})
	if _, err = store.ImportHistorical(ctx, strings.NewReader(string(input)), false, now); err != nil {
		t.Fatal("reviewed history validation failed", err)
	}
	var count int
	if err = store.DB.QueryRowContext(ctx, `SELECT count(*) FROM market.candles WHERE security_id='NSE:KCB'`).Scan(&count); err != nil || count != 0 {
		t.Fatal("validation wrote history", err)
	}
	if _, err = store.ImportHistorical(ctx, strings.NewReader(string(input)), true, now); err != nil {
		t.Fatal("actual reviewed history insert failed", err)
	}
	if _, err = store.ImportHistorical(ctx, strings.NewReader(string(input)), true, now); err != nil {
		t.Fatal("reviewed history retry was not idempotent", err)
	}
	row.Close = 91
	input, _ = json.Marshal([]HistoricalObservation{row})
	if _, err = store.ImportHistorical(ctx, strings.NewReader(string(input)), true, now); err == nil {
		t.Fatal("conflicting history silently replaced source observation")
	}
	research := `[{"id":"fixture-index","kind":"market_statistics","title":"Synthetic index fixture","observedAt":"` + now.UTC().Add(-time.Hour).Format(time.RFC3339Nano) + `","sourceUrl":"https://www.nse.co.ke/fixture-report.pdf","payload":{"indicator":"NASI","actual":100,"change":1,"unit":"points","permissionReference":"synthetic-fixture-only"}}]`
	if _, err = store.ImportResearch(ctx, strings.NewReader(research), true, now); err != nil {
		t.Fatal("actual official research import failed", err)
	}
	if err = store.DB.QueryRowContext(ctx, `SELECT count(*) FROM market.indices WHERE code='NASI' AND value=100 AND previous_close=99`).Scan(&count); err != nil || count != 1 {
		t.Fatal("paired index update failed", err)
	}
}
