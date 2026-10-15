package ingestion

import (
	"context"
	"continua/backend/internal/engine"
	"continua/backend/internal/marketdata"
	"encoding/json"
	"testing"
)

type sparseSourceTransport struct{ NSETransport }

func (sparseSourceTransport) Securities(context.Context) ([]json.RawMessage, error) {
	return []json.RawMessage{json.RawMessage(`{"Symbol":"KCB","TradingStatus":"ACTIVE"}`)}, nil
}

type sparseListingMapper struct{ calls int }

func (m *sparseListingMapper) Calculate(_ context.Context, request engine.Request) (json.RawMessage, error) {
	m.calls++
	if request.Operation != "map_nse_batch" {
		panic("existing issuer should not require profile normalization or writes")
	}
	return json.RawMessage(`[{"security":{"id":"NSE:KCB","symbol":"KCB","exchange":"NSE","companyId":"NSE:company:KCB","currency":"KES","status":"active"},"company":{"id":"NSE:company:KCB"},"sector":{}}]`), nil
}

type registeredListingStore struct {
	SourceSyncStore
	run marketdata.IngestionRun
}

func (s *registeredListingStore) RegisteredSecurity(context.Context, string, string) (*marketdata.SecurityInput, error) {
	return &marketdata.SecurityInput{ID: "NSE:KCB", Symbol: "KCB", Status: "delisted"}, nil
}
func (s *registeredListingStore) RecordIngestionRun(_ context.Context, run marketdata.IngestionRun) error {
	s.run = run
	return nil
}

func TestBootstrapSkipsSparseExistingAndNeverResurrectsDelistedRegistration(t *testing.T) {
	mapper := &sparseListingMapper{}
	store := &registeredListingStore{}
	syncer := &SourceSync{Store: store, Worker: mapper, Adapter: &NSEAdapter{Transport: sparseSourceTransport{}, Worker: mapper}}
	count, err := syncer.Bootstrap(context.Background())
	if err != nil || count != 0 || mapper.calls != 1 || store.run.ErrorCount != 0 || store.run.Status != "success" {
		t.Fatal("sparse registration bootstrap failed", err, count, mapper.calls, store.run)
	}
}
