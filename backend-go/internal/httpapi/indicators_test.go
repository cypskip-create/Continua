package httpapi

import (
	"context"
	"continua/backend/internal/engine"
	"encoding/json"
	"net/http/httptest"
	"testing"
)

type indicatorCalculator struct{ options map[string]any }

func (f *indicatorCalculator) Calculate(_ context.Context, r engine.Request) (json.RawMessage, error) {
	f.options = r.Args[3].([]any)[0].(map[string]any)
	return json.RawMessage(`[{"symbol":"COOP","type":"SMA","latest":null,"values":[null]}]`), nil
}

func TestIndicatorsPreserveUnknownValuesAndValidateBeforeDatabaseReads(t *testing.T) {
	s, store := fixtureServer()
	f := &historyFixture{fixtureStore: store, rows: []json.RawMessage{json.RawMessage(`{"timestamp":"2026-10-12","close":36.6}`)}}
	s.Store = f
	calc := &indicatorCalculator{}
	s.Engine = calc
	r := httptest.NewRequest("GET", "/api/v1/indicators/coop?type=SMA&period=200", nil)
	r.Header.Set("X-API-Key", "fixture-dev")
	w := httptest.NewRecorder()
	s.ServeHTTP(w, r)
	if w.Code != 200 || calc.options["period"] != 200 || f.sourceInterval != "1d" {
		t.Fatal(w.Code, w.Body.String())
	}
	before := f.calls
	for _, query := range []string{"type=FAKE", "type=SMA&period=0", "type=SMA&slow=501", "type=SMA&fast=2&fast=3", "type=SMA&from=2026-02-30"} {
		r = httptest.NewRequest("GET", "/api/v1/indicators/coop?"+query, nil)
		r.Header.Set("X-API-Key", "fixture-dev")
		w = httptest.NewRecorder()
		s.ServeHTTP(w, r)
		if w.Code != 400 {
			t.Fatal(query, w.Code)
		}
	}
	if f.calls != before {
		t.Fatal("invalid indicator input reached candle storage")
	}
}
