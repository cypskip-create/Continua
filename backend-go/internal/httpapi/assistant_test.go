package httpapi

import (
	"context"
	"continua/backend/internal/auth"
	"continua/backend/internal/engine"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

type assistantBundlesFixture struct{ symbols []string }

func (f *assistantBundlesFixture) Bundle(_ context.Context, symbol, exchange string) (json.RawMessage, error) {
	f.symbols = append(f.symbols, symbol)
	return json.RawMessage(`{"companyName":"Observed issuer"}`), nil
}

type assistantCalculatorFixture struct{ calls int }

func (f *assistantCalculatorFixture) Calculate(_ context.Context, r engine.Request) (json.RawMessage, error) {
	f.calls++
	if r.Operation != "assistant_answer" {
		panic("unexpected assistant operation")
	}
	return json.RawMessage(`{"answer":"Observed facts","citations":[],"cached":false}`), nil
}
func TestCalculatedAssistantRejectsClientEvidenceAndPreservesRequestedOrder(t *testing.T) {
	s, _ := fixtureServer()
	bundles := new(assistantBundlesFixture)
	calc := new(assistantCalculatorFixture)
	s.EngineBundles = bundles
	s.Advanced = calc
	run := func(plan, body string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		s.assistant(context.Background(), w, httptest.NewRequest("POST", "/api/v1/engine/assistant", strings.NewReader(body)), &auth.Identity{UserID: "verified-owner", Plan: plan})
		return w
	}
	valid := `{"question":"Revenue growth?","symbols":["KCB","ABSA","KCB"]}`
	if w := run("free", valid); w.Code != 403 || calc.calls != 0 {
		t.Fatal("assistant entitlement bypass")
	}
	for _, raw := range []string{`{"question":"Revenue?","symbols":["KCB"],"facts":{}}`, `{"question":"Revenue?","symbols":["KCB"],"scope":null}`, `{"question":"Revenue?","symbols":["KCB"],"exchange":""}`, valid + ` {}`} {
		if w := run("premium_plus", raw); w.Code != 400 {
			t.Fatal("invalid schema accepted", w.Code)
		}
	}
	if w := run("premium_plus", valid); w.Code != 200 || calc.calls != 1 || strings.Join(bundles.symbols, ",") != "KCB,ABSA" {
		t.Fatal(w.Code, bundles.symbols, calc.calls)
	}
}
