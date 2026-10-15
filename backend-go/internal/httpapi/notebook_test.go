package httpapi

import (
	"context"
	"continua/backend/internal/auth"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

type notebookFixture struct {
	calls         int
	owner, action string
}

func (f *notebookFixture) List(_ context.Context, owner string) (json.RawMessage, error) {
	f.calls++
	f.owner = owner
	return json.RawMessage(`{"forecasts":[]}`), nil
}
func (f *notebookFixture) Mutate(_ context.Context, owner, id, action string, raw json.RawMessage) (json.RawMessage, error) {
	f.calls++
	f.owner, f.action = owner, action
	return json.RawMessage(`{"id":"saved"}`), nil
}
func TestNotebookRequiresPlusAndUsesVerifiedOwner(t *testing.T) {
	s := New(nil, nil)
	f := &notebookFixture{}
	s.Notebook = f
	r := httptest.NewRequest("POST", "/api/v1/engine/notebook", strings.NewReader(`{"userId":"other"}`))
	w := httptest.NewRecorder()
	s.notebook(context.Background(), w, r, &auth.Identity{UserID: "verified", Plan: "premium"})
	if w.Code != 403 || f.calls != 0 {
		t.Fatal(w.Code)
	}
	r = httptest.NewRequest("POST", "/api/v1/engine/notebook", strings.NewReader(`{}`))
	w = httptest.NewRecorder()
	s.notebook(context.Background(), w, r, &auth.Identity{UserID: "verified", Plan: "premium_plus"})
	if w.Code != 201 || f.owner != "verified" || f.action != "create" {
		t.Fatal(w.Code, f)
	}
	r = httptest.NewRequest("POST", "/api/v1/engine/notebook/not-an-id/resolve", strings.NewReader(`{}`))
	w = httptest.NewRecorder()
	s.notebook(context.Background(), w, r, &auth.Identity{UserID: "verified", Plan: "premium_plus"})
	if w.Code != 400 || f.calls != 1 {
		t.Fatal(w.Code, f)
	}
}
