package httpapi

import (
	"encoding/json"
	"testing"
	"time"
)

func TestEveryServedQuoteChecksObservationAgeWithoutInventingDates(t *testing.T) {
	s, _ := fixtureServer()
	s.IgnoreCalendar = true
	now := time.Date(2026, 10, 15, 9, 0, 0, 0, time.UTC)
	calls := 0
	s.QuoteWarning = func(count int, oldest time.Duration) {
		calls++
		if count != 1 || oldest != time.Hour {
			t.Fatal(count, oldest)
		}
	}
	rows := []json.RawMessage{json.RawMessage(`{"timestamp":"2026-10-15T08:00:00Z"}`), json.RawMessage(`{"timestamp":"2026-10-15T08:59:00Z"}`), json.RawMessage(`{"timestamp":null}`)}
	s.checkQuoteFreshness(rows, now)
	s.checkQuoteFreshness(rows, now)
	if calls != 2 {
		t.Fatal("read-time checks were skipped")
	}
	s.IgnoreCalendar = false
	s.checkQuoteFreshness(rows, time.Date(2026, 10, 18, 9, 0, 0, 0, time.UTC))
	if calls != 2 {
		t.Fatal("closed-market stale warnings emitted")
	}
}
