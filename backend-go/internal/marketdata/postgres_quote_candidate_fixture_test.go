package marketdata

import (
	"context"
	"encoding/json"
	"testing"
	"time"
)

// Synthetic private evidence only; never fetches source data or writes R2.
func verifyQuoteCandidatePostgresFixture(t *testing.T, store *Store, ctx context.Context) {
	t.Helper()
	_, err := store.DB.ExecContext(ctx, `INSERT INTO scraping.sources(id,name,adapter,enabled,redistribution_allowed,config) VALUES('fixture-quotes','Fixture','mystocks',true,true,'{"permissionReference":"synthetic-fixture-only","quoteMappingApproved":"mystocks-literal-observations-v1"}')`)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if _, err := store.DB.ExecContext(ctx, `DELETE FROM scraping.sources WHERE id='fixture-quotes'`); err != nil {
			t.Error(err)
		}
	}()
	var artifact int64
	err = store.DB.QueryRowContext(ctx, `INSERT INTO scraping.raw_artifacts(source_id,adapter,sha256,document_url,storage_path,crawler_version) VALUES('fixture-quotes','mystocks',repeat('a',64),'https://live.mystocks.co.ke/x/f123-ABSA','r2://continua-financial-documents/synthetic-fixture','fixture') RETURNING id`).Scan(&artifact)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if _, err := store.DB.ExecContext(ctx, `DELETE FROM scraping.raw_artifacts WHERE id=$1`, artifact); err != nil {
			t.Error(err)
		}
	}()
	var now time.Time
	if err = store.DB.QueryRowContext(ctx, `SELECT now()`).Scan(&now); err != nil {
		t.Fatal(err)
	}
	stamp := now.UTC().Add(-time.Hour).Format("2006-01-02T15:04:05.000Z")
	insert := func(timestamp string, price int) {
		t.Helper()
		payload, _ := json.Marshal([]any{map[string]any{"kind": "market_quote_candidate", "symbol": "KCB", "timestamp": timestamp, "lastPrice": price}})
		if _, err := store.DB.ExecContext(ctx, `INSERT INTO scraping.extractions(artifact_id,method,parser_version,tables,entity,needs_review) VALUES($1,'json','mystocks-literal-observations-v1',$2::jsonb,'{"ticker":"KCB","exchange":"NSE"}',true)`, artifact, string(payload)); err != nil {
			t.Fatal(err)
		}
	}
	defer func() {
		if _, err := store.DB.ExecContext(ctx, `DELETE FROM scraping.extractions WHERE artifact_id=$1;`, artifact); err != nil {
			t.Error(err)
		}
		if _, err := store.DB.ExecContext(ctx, `DELETE FROM scraping.artifact_urls WHERE artifact_id=$1`, artifact); err != nil {
			t.Error(err)
		}
	}()
	insert(stamp, 30)
	rows, err := store.PublishedQuoteCandidates(ctx)
	if err != nil || len(rows) != 0 {
		t.Fatal("mismatched source ticker accepted", err)
	}
	if _, err = store.DB.ExecContext(ctx, `INSERT INTO scraping.artifact_urls(artifact_id,url) VALUES($1,'https://live.mystocks.co.ke/x/f456-KCB')`, artifact); err != nil {
		t.Fatal(err)
	}
	// Later extraction/retrieval cannot outrank newer source observation time.
	insert(now.UTC().Add(-2*time.Hour).Format("2006-01-02T15:04:05.000Z"), 20)
	insert("2026-02-30T00:00:00.000Z", 999)
	insert(now.UTC().Add(time.Hour).Format("2006-01-02T15:04:05.000Z"), 999)
	rows, err = store.PublishedQuoteCandidates(ctx)
	if err != nil || len(rows) != 1 {
		t.Fatal("valid source quote unavailable", err)
	}
	var result struct {
		Observation struct {
			LastPrice int `json:"lastPrice"`
		} `json:"observation"`
	}
	if json.Unmarshal(rows[0], &result) != nil || result.Observation.LastPrice != 30 {
		t.Fatal("wrong source observation selected")
	}
}
