package engine

import (
	"context"
	"continua/backend/internal/cache"
	"encoding/json"
	"errors"
	"fmt"
	"testing"
)

type newsFixture struct {
	rows            []json.RawMessage
	pages, articles int
}

func (f *newsFixture) NewsDirectory(context.Context, string) ([]json.RawMessage, error) {
	return []json.RawMessage{json.RawMessage(`{"symbol":"KCB","companyName":"KCB Group PLC","securityId":"NSE:KCB"}`)}, nil
}
func (f *newsFixture) NewsCandidates(_ context.Context, _, _ *string, batch, offset int) ([]json.RawMessage, error) {
	f.pages++
	if offset >= len(f.rows) {
		return []json.RawMessage{}, nil
	}
	end := offset + batch
	if end > len(f.rows) {
		end = len(f.rows)
	}
	return f.rows[offset:end], nil
}
func (f *newsFixture) NewsArticle(context.Context, string) (json.RawMessage, error) {
	f.articles++
	if len(f.rows) == 0 {
		return nil, nil
	}
	return f.rows[0], nil
}

func TestRealNativeNewsSessionMapsEveryPageAndKeepsBestVerifiedReceipt(t *testing.T) {
	normal := worker(t)
	evidence := NewEvidenceWorker(normal.Python, normal.Script)
	f := &newsFixture{}
	for i := 0; i < 260; i++ {
		raw, _ := json.Marshal(map[string]any{"id": fmt.Sprint(i + 1), "headline": fmt.Sprintf("KCB Group profit results %d", i), "articleUrl": fmt.Sprintf("https://issuer.example/%d", i), "excerpt": "The bank reported its latest financial performance.", "matchingText": "The bank reported its latest financial performance.", "needsReview": false, "extractionConfidence": .9})
		f.rows = append(f.rows, raw)
	}
	duplicate, _ := json.Marshal(map[string]any{"id": "261", "headline": "KCB Group profit results 0!", "articleUrl": "https://issuer.example/0?track=1", "excerpt": "A substantially longer verified receipt of the bank's latest financial performance and source disclosure.", "matchingText": "The bank reported its latest financial performance.", "needsReview": false, "extractionConfidence": .9})
	f.rows = append(f.rows, duplicate)
	reader := &NewsReader{Store: f, Worker: evidence, Cache: cache.NewMemory()}
	id := "NSE:KCB"
	rows, err := reader.List(context.Background(), &id, nil, 10)
	if err != nil || len(rows) != 10 || f.pages < 3 {
		t.Fatal(len(rows), f.pages, err)
	}
	var first struct {
		ID          string   `json:"id"`
		SecurityIDs []string `json:"securityIds"`
	}
	if json.Unmarshal(rows[0], &first) != nil || first.ID != "261" || len(first.SecurityIDs) != 1 || first.SecurityIDs[0] != "NSE:KCB" {
		t.Fatal(string(rows[0]))
	}
	pages := f.pages
	if _, err = reader.List(context.Background(), &id, nil, 10); err != nil || f.pages != pages {
		t.Fatal("unchanged request repeated source transfer", err)
	}
	reader.Cache.DeletePrefix("news:list:")
	if _, err = reader.List(context.Background(), &id, nil, 10); err != nil || f.pages == pages {
		t.Fatal("committed-change invalidation ignored", err)
	}
}

func TestEvidenceSessionRejectsUnrelatedOperationsAndPropagatesFailure(t *testing.T) {
	normal := worker(t)
	w := NewEvidenceWorker(normal.Python, normal.Script)
	expected := errors.New("fixture stopped")
	err := w.WithEvidence(context.Background(), func(invoke EvidenceInvoke) error {
		if _, err := invoke(Request{Operation: "ratios", Args: []any{}}); err == nil {
			t.Fatal("unrelated operation accepted")
		}
		if _, err := invoke(Request{Operation: "map_news_rows", Args: []any{[]any{}, []any{}, nil}}); err != nil {
			t.Fatal(err)
		}
		return expected
	})
	if !errors.Is(err, expected) {
		t.Fatal(err)
	}
	// A failed session releases both profile and process admission.
	if err = w.WithEvidence(context.Background(), func(invoke EvidenceInvoke) error {
		_, err := invoke(Request{Operation: "dedupe_news", Args: []any{[]any{}}})
		return err
	}); err != nil {
		t.Fatal(err)
	}
}
