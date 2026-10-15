package ingestion

import (
	"context"
	"continua/backend/internal/engine"
	"continua/backend/internal/marketdata"
	"encoding/json"
	"errors"
	"testing"
	"time"
)

type newsFixture struct {
	directory     []json.RawMessage
	rows          map[int64]json.RawMessage
	reads, writes int
	failures      []int64
	logged        bool
}

func (f *newsFixture) PendingNewsExtractions(context.Context, int) ([]int64, error) {
	return []int64{1, 2}, nil
}
func (f *newsFixture) NewsExtraction(_ context.Context, id int64) (json.RawMessage, error) {
	f.reads++
	return f.rows[id], nil
}
func (f *newsFixture) NewsDirectory(context.Context, string) ([]json.RawMessage, error) {
	return f.directory, nil
}
func (f *newsFixture) UpsertNews(context.Context, marketdata.NewsInput) error { f.writes++; return nil }
func (f *newsFixture) RecordNewsFailure(_ context.Context, id int64) error {
	f.failures = append(f.failures, id)
	return nil
}
func (f *newsFixture) RecordNewsRun(context.Context, time.Time, int, int) error {
	f.logged = true
	return nil
}

type calculateFixture struct {
	calls int
	fail  bool
}

func (f *calculateFixture) Calculate(_ context.Context, r engine.Request) (json.RawMessage, error) {
	f.calls++
	if f.fail {
		return nil, errors.New("fixture unavailable")
	}
	var row map[string]any
	_ = json.Unmarshal(r.Args[0].(json.RawMessage), &row)
	raw, _ := json.Marshal(map[string]any{"scrapedExtractionId": row["extractionId"], "securityIds": []string{"NSE:KCB"}})
	return raw, nil
}
func TestNewsBridgeProcessesOneBodyAtATimeAndSkipsForbiddenFeeds(t *testing.T) {
	store := &newsFixture{directory: []json.RawMessage{json.RawMessage(`{"securityId":"NSE:KCB"}`)}, rows: map[int64]json.RawMessage{1: json.RawMessage(`{"extractionId":1,"sourceId":"fixture","documentUrl":"https://fixture.example/a"}`), 2: json.RawMessage(`{"extractionId":2,"sourceId":"test-rss","documentUrl":"https://fixture.example/a"}`)}}
	worker := &calculateFixture{}
	bridge := NewsBridge{Store: store, Worker: worker}
	summary, err := bridge.Run(context.Background(), "NSE", 100)
	if err != nil || summary.Processed != 2 || summary.WithMentions != 1 || worker.calls != 1 || store.writes != 1 || !store.logged {
		t.Fatal(summary, err)
	}
}
func TestNewsBridgeWorkerFailureLeavesNoPublishedReceiptAndRecordsRetry(t *testing.T) {
	store := &newsFixture{directory: []json.RawMessage{json.RawMessage(`{}`)}, rows: map[int64]json.RawMessage{1: json.RawMessage(`{"sourceId":"fixture","documentUrl":"https://fixture.example/a"}`), 2: json.RawMessage(`{"sourceId":"fixture","documentUrl":"https://fixture.example/b"}`)}}
	bridge := NewsBridge{Store: store, Worker: &calculateFixture{fail: true}}
	summary, err := bridge.Run(context.Background(), "NSE", 100)
	if err != nil || summary.Failed != 2 || store.writes != 0 || len(store.failures) != 2 || !store.logged {
		t.Fatal(summary, err)
	}
}
func TestNewsBridgeEmptyDirectoryFailsBeforeEvidenceIsMisclassified(t *testing.T) {
	store := &newsFixture{}
	bridge := NewsBridge{Store: store, Worker: &calculateFixture{}}
	if _, err := bridge.Run(context.Background(), "NSE", 100); err == nil || store.reads != 0 || store.writes != 0 {
		t.Fatal(err)
	}
}
