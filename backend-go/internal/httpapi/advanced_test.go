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

type advancedFixture struct {
	calls  int
	result json.RawMessage
}

func (f *advancedFixture) Calculate(_ context.Context, r engine.Request) (json.RawMessage, error) {
	f.calls++
	if r.Operation != "run_advanced" {
		panic("unexpected operation")
	}
	return f.result, nil
}
func TestAdvancedPlusGateCapacityAndValidationStatuses(t *testing.T) {
	s := New(nil, nil)
	f := &advancedFixture{result: json.RawMessage(`{"status":422,"error":"History gaps exceed four calendar days."}`)}
	s.Advanced = f
	run := func(plan string) *httptest.ResponseRecorder {
		r := httptest.NewRequest("POST", "/api/v1/engine/labs/advanced", strings.NewReader(`{}`))
		w := httptest.NewRecorder()
		s.advanced(context.Background(), w, r, &auth.Identity{UserID: "verified", Plan: plan})
		return w
	}
	if w := run("free"); w.Code != 403 || f.calls != 0 {
		t.Fatal(w.Code)
	}
	if w := run("premium_plus"); w.Code != 422 || f.calls != 1 {
		t.Fatal(w.Code)
	}
	s.largeBodies <- struct{}{}
	s.largeBodies <- struct{}{}
	if w := run("premium_plus"); w.Code != 429 || f.calls != 1 {
		t.Fatal(w.Code)
	}
	<-s.largeBodies
	<-s.largeBodies
	f.result = json.RawMessage(`{"status":200,"data":{"kind":"replay"}}`)
	if w := run("premium_plus"); w.Code != 200 || !strings.Contains(w.Body.String(), `"kind":"replay"`) {
		t.Fatal(w.Code, w.Body.String())
	}
}
