package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

type publisherFixture struct {
	*historyFixture
	profile      json.RawMessage
	observations []json.RawMessage
	sourceErr    error
	ticker       string
}

func (f *publisherFixture) CompanyProfile(context.Context, string, string) (json.RawMessage, error) {
	return f.profile, nil
}
func (f *publisherFixture) PublisherProfileRows(context.Context, string) ([]json.RawMessage, error) {
	return f.observations, f.sourceErr
}
func (f *publisherFixture) PublisherFinancialRows(_ context.Context, ticker string) ([]json.RawMessage, error) {
	f.ticker = ticker
	return f.observations, f.sourceErr
}
func (f *publisherFixture) CollectedResearch(_ context.Context, ticker string, limit, offset int) ([]json.RawMessage, error) {
	f.ticker = ticker
	return f.observations, f.sourceErr
}
func TestCollectedResearchUsesAuthenticatedIssuerScopedStorage(t *testing.T) {
	s, p := publisherServer()
	p.observations = []json.RawMessage{json.RawMessage(`{"destination":"financials","status":"publisher_observation"}`)}
	w := request(s, "/api/v1/financials/COOP/collected-research", "fixture-dev")
	if w.Code != 200 || p.ticker != "COOP" || w.Header().Get("Cache-Control") != "no-store" || !strings.Contains(w.Body.String(), "publisher_observation") {
		t.Fatal(w.Code, w.Body.String())
	}
	p.known = false
	if w := request(s, "/api/v1/financials/UNKNOWN/collected-research", "fixture-dev"); w.Code != 404 {
		t.Fatal(w.Code)
	}
}
func TestCollectedResearchOutageIsNotAFalseEmptySuccess(t *testing.T) {
	s, p := publisherServer()
	p.sourceErr = errors.New("fixture unavailable")
	if w := request(s, "/api/v1/financials/COOP/collected-research", "fixture-dev"); w.Code != 503 {
		t.Fatal(w.Code, w.Body.String())
	}
}
func publisherServer() (*Server, *publisherFixture) {
	s, h := historyServer()
	p := &publisherFixture{historyFixture: h}
	s.Store = p
	return s, p
}
func TestProfileSurvivesMissingSupplementAndOmitsUndefinedFields(t *testing.T) {
	s, p := publisherServer()
	p.profile = json.RawMessage(`{"symbol":"COOP","company":{"name":"Co-op Bank","headquarters":null,"website":null,"ceo":null}}`)
	p.sourceErr = errors.New("fixture collection unavailable")
	s.Engine = &calculationFixture{}
	w := request(s, "/api/v1/companies/COOP", "fixture-dev")
	if w.Code != 200 || strings.Contains(w.Body.String(), "headquarters") || !strings.Contains(w.Body.String(), `"ceo":null`) {
		t.Fatal(w.Code, w.Body.String())
	}
}
func TestProfileSupplementDoesNotOverwriteExistingCoreFacts(t *testing.T) {
	s, p := publisherServer()
	p.profile = json.RawMessage(`{"symbol":"COOP","company":{"name":"Co-op Bank","headquarters":"Core address","website":null}}`)
	p.observations = []json.RawMessage{json.RawMessage(`{"tables":[],"sourceUrl":"https://afx.kwayisi.org/nse/coop.html","observedAt":"2026-10-13T08:00:00.000Z"}`)}
	calculator := &calculationFixture{raw: json.RawMessage(`{"headquarters":"Publisher address","website":"https://example.test"}`)}
	s.Engine = calculator
	w := request(s, "/api/v1/companies/COOP", "fixture-dev")
	if w.Code != 200 || strings.Contains(w.Body.String(), "Publisher address") || !strings.Contains(w.Body.String(), "Core address") || !strings.Contains(w.Body.String(), "https://example.test") || calculator.operation != "publisher_profile" {
		t.Fatal(w.Code, w.Body.String())
	}
}
func TestFinancialPublisherRejectsWrongOriginTickerTabAndPreservesObservation(t *testing.T) {
	s, p := publisherServer()
	calculator := &calculationFixture{raw: json.RawMessage(`[{"category":"Assets","columns":["Metric","2025"],"rows":[{"label":"Total assets","rowKind":"total","values":["1.23 B"]}]}]`)}
	s.Engine = calculator
	p.observations = []json.RawMessage{}
	for _, url := range []string{"https://evil.test/stock/nse/COOP?tab=Financials", "https://kenyanstocks.com/stock/nse/KCB?tab=Financials", "https://kenyanstocks.com/stock/nse/COOP?tab=News", "https://kenyanstocks.com/stock/nse/%43OOP?tab=Financials", "https://kenyanstocks.com/stock/nse/COOP?tab=Financials"} {
		row, _ := json.Marshal(map[string]any{"tables": []any{}, "sourceUrl": url, "observedAt": "2026-10-13T08:00:00.000Z"})
		p.observations = append(p.observations, row)
	}
	w := request(s, "/api/v1/financials/COOP/publisher-tables", "fixture-dev")
	var body struct{ Data []map[string]any }
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	if w.Code != 200 || len(body.Data) != 1 || body.Data[0]["status"] != "publisher_observation" || !strings.Contains(w.Body.String(), "1.23 B") || calculator.operation != "source_financial_tables" {
		t.Fatal(w.Code, w.Body.String())
	}
}
func TestPublisherTickerAliasesAndMissingNativeValidatorAreExplicit(t *testing.T) {
	s, p := publisherServer()
	if w := request(s, "/api/v1/financials/COOP/publisher-tables", "fixture-dev"); w.Code != 503 {
		t.Fatal("unvalidated source reported", w.Code)
	}
	s.Engine = &calculationFixture{raw: json.RawMessage(`[]`)}
	if w := request(s, "/api/v1/financials/STANBIC/publisher-tables", "fixture-dev"); w.Code != 200 || p.ticker != "SBIC" {
		t.Fatal(w.Code, p.ticker)
	}
	p.known = false
	if w := request(s, "/api/v1/financials/UNKNOWN/publisher-tables", "fixture-dev"); w.Code != 404 {
		t.Fatal(w.Code)
	}
}
