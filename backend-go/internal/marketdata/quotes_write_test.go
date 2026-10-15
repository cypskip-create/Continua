package marketdata

import (
	"context"
	"encoding/json"
	"github.com/DATA-DOG/go-sqlmock"
	"testing"
	"time"
)

func validQuote() QuoteInput {
	var q QuoteInput
	_ = json.Unmarshal([]byte(`{"securityId":"NSE:KCB","symbol":"KCB","exchange":"NSE","lastPrice":30,"open":29,"high":31,"low":28,"previousClose":29,"change":1,"changePercent":3.45,"volume":0,"currency":"KES","status":"active","timestamp":"2026-10-14T12:00:00Z","source":"delayed"}`), &q)
	return q
}
func TestQuoteMissingObservationsFutureAndDuplicateIdentityRejectedBeforeSQL(t *testing.T) {
	s, _ := mockStore(t)
	now := time.Date(2026, 10, 14, 13, 0, 0, 0, time.UTC)
	q := validQuote()
	absent := q
	absent.Volume = nil
	if _, err := s.UpsertQuotesBatch(context.Background(), []QuoteInput{absent}, now); err == nil {
		t.Fatal("missing volume replaced with zero")
	}
	future := q
	future.Timestamp = "2026-10-15T12:00:00Z"
	if _, err := s.UpsertQuotesBatch(context.Background(), []QuoteInput{future}, now); err == nil {
		t.Fatal("future quote published")
	}
	if _, err := s.UpsertQuotesBatch(context.Background(), []QuoteInput{q, q}, now); err == nil {
		t.Fatal("duplicate identity accepted")
	}
}
func TestQuoteBatchDoesNotOverwriteOlderOrRepeatUnchangedPayload(t *testing.T) {
	s, m := mockStore(t)
	m.ExpectQuery(`WITH input.*JOIN market.securities.*EXCLUDED.event_timestamp>=market.live_quotes.event_timestamp.*IS DISTINCT FROM.*RETURNING.*ORDER BY q.symbol`).WillReturnRows(sqlmock.NewRows([]string{"row"}))
	rows, err := s.UpsertQuotesBatch(context.Background(), []QuoteInput{validQuote()}, time.Date(2026, 10, 14, 13, 0, 0, 0, time.UTC))
	if err != nil || len(rows) != 0 {
		t.Fatal(rows, err)
	}
}

func TestChangedQuotesEnqueueResearchRefreshInSameStatement(t *testing.T) {
	s, m := mockStore(t)
	s.DurableQuoteRefresh = true
	m.ExpectQuery(`WITH input.*requested_refresh AS.*INSERT INTO market.native_research_refresh.*SELECT security_id,symbol FROM saved.*ORDER BY q.symbol`).WillReturnRows(sqlmock.NewRows([]string{"row"}))
	if _, e := s.UpsertQuotesBatch(context.Background(), []QuoteInput{validQuote()}, time.Date(2026, 10, 14, 13, 0, 0, 0, time.UTC)); e != nil {
		t.Fatal(e)
	}
}
