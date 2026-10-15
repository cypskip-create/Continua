package httpapi

import (
	"context"
	"continua/backend/internal/engine"
	"continua/backend/internal/marketdata"
	"continua/backend/internal/publication"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"
)

type adminFixture struct {
	calls     int
	raw       json.RawMessage
	rejectErr error
}

func (f *adminFixture) PendingCandidates(context.Context, int) ([]json.RawMessage, error) {
	f.calls++
	return nil, nil
}
func (f *adminFixture) Candidate(context.Context, string) (json.RawMessage, error) {
	f.calls++
	return f.raw, nil
}
func (f *adminFixture) RejectCandidate(context.Context, string, *string) error {
	f.calls++
	return f.rejectErr
}
func (f *adminFixture) AdminSecurities(context.Context, string) ([]json.RawMessage, error) {
	f.calls++
	return nil, nil
}
func (f *adminFixture) Calculate(context.Context, engine.Request) (json.RawMessage, error) {
	return json.RawMessage(`{"statementType":"income"}`), nil
}
func (f *adminFixture) Confirm(_ context.Context, id string, raw json.RawMessage) (*publication.Result, error) {
	f.calls++
	f.raw = raw
	var input publication.Confirmation
	if json.Unmarshal(raw, &input) != nil || !input.UnitsVerified || len(input.Periods) == 0 || input.Periods[0].SourcePage < 1 {
		return nil, publication.ErrInvalidConfirmation
	}
	return &publication.Result{CandidateID: id, PeriodIDs: []string{"NSE:period:KCB:2024"}}, nil
}
func adminRequest(s *Server, path, method, body, key string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, "/api/v1/admin/"+path, strings.NewReader(body))
	r.Header.Set("X-Admin-Key", key)
	w := httptest.NewRecorder()
	s.ServeHTTP(w, r)
	return w
}
func TestAdminSecretIsIndependentOfPublicKeyAndFailsBeforeDatabase(t *testing.T) {
	f := &adminFixture{}
	s := New(nil, nil)
	s.Admin = &AdminService{Key: strings.Repeat("x", 32), Store: f}
	for _, key := range []string{"", strings.Repeat("y", 32)} {
		if w := adminRequest(s, "financials/candidates", "GET", "", key); w.Code != 401 || f.calls != 0 {
			t.Fatal(w.Code, f.calls)
		}
	}
	if w := adminRequest(s, "financials/candidates", "GET", "", s.Admin.Key); w.Code != 200 || f.calls != 1 || !strings.Contains(w.Body.String(), `"data":[]`) {
		t.Fatal(w.Code, w.Body.String())
	}
	s.Admin.Key = "short"
	if w := adminRequest(s, "financials/candidates", "GET", "", "short"); w.Code != 503 {
		t.Fatal(w.Code)
	}
}
func TestAdminValidationAndConcurrentReviewConflict(t *testing.T) {
	f := &adminFixture{rejectErr: marketdata.ErrCandidateReviewed}
	s := New(nil, nil)
	s.Admin = &AdminService{Key: strings.Repeat("x", 32), Store: f, Publisher: f, Worker: f}
	for _, path := range []string{"financials/candidates?limit=999", "financials/candidates?limit=1&limit=2", "financials/candidates/nope", "securities?exchange=OTHER"} {
		if w := adminRequest(s, path, "GET", "", s.Admin.Key); w.Code != 400 {
			t.Fatal(path, w.Code)
		}
	}
	if f.calls != 0 {
		t.Fatal(f.calls)
	}
	if w := adminRequest(s, "financials/candidates/1/reject", "POST", `{"note":"Reviewed"}`, s.Admin.Key); w.Code != 409 {
		t.Fatal(w.Code)
	}
	f.rejectErr = errors.New("private database detail")
	w := adminRequest(s, "financials/candidates/1/reject", "POST", `{}`, s.Admin.Key)
	if w.Code != 503 || strings.Contains(w.Body.String(), "private") {
		t.Fatal(w.Code, w.Body.String())
	}
}
func TestSingleColumnConfirmationCannotInventEvidence(t *testing.T) {
	f := &adminFixture{}
	s := New(nil, nil)
	s.Admin = &AdminService{Key: strings.Repeat("x", 32), Store: f, Publisher: f}
	w := adminRequest(s, "financials/candidates/1/confirm", "POST", `{"statementType":"income","period":{},"income":{"revenue":1}}`, s.Admin.Key)
	if w.Code != 400 {
		t.Fatal(w.Code, w.Body.String())
	}
	var input publication.Confirmation
	_ = json.Unmarshal(f.raw, &input)
	if input.UnitsVerified || input.Periods[0].SourcePage != 0 {
		t.Fatal(string(f.raw))
	}
	w = adminRequest(s, "financials/candidates/1/confirm", "POST", `{"securityId":"NSE:KCB","unitsVerified":true,"sourcePage":2,"columnIndex":0,"statementType":"income","period":{},"income":{"revenue":1}}`, s.Admin.Key)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"periodId":"NSE:period:KCB:2024"`) {
		t.Fatal(w.Code, w.Body.String())
	}
}
func TestAdminDraftMissingAndRequestSizeAreBounded(t *testing.T) {
	f := &adminFixture{}
	s := New(nil, nil)
	s.Admin = &AdminService{Key: strings.Repeat("x", 32), Store: f, Worker: f}
	if w := adminRequest(s, "financials/candidates/1", "GET", "", s.Admin.Key); w.Code != 404 {
		t.Fatal(w.Code)
	}
	f.raw = json.RawMessage(`{"detectedTable":{"rows":[]}}`)
	if w := adminRequest(s, "financials/candidates/1", "GET", "", s.Admin.Key); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := adminRequest(s, "financials/candidates/1/reject", "POST", strings.Repeat("x", 1048577), s.Admin.Key); w.Code != 413 {
		t.Fatal(w.Code)
	}
}
