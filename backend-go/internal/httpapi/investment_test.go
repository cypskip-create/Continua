package httpapi

import (
	"context"
	"continua/backend/internal/auth"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type investmentFixtureStore struct {
	MarketStore
	owner string
	kind  string
}

func (f *investmentFixtureStore) InvestmentEvidence(_ context.Context, kind, cutoff, symbol string) ([]json.RawMessage, error) {
	f.kind = kind
	return []json.RawMessage{}, nil
}
func (f *investmentFixtureStore) InvestmentSimulations(_ context.Context, owner string) ([]json.RawMessage, error) {
	f.owner = owner
	return []json.RawMessage{}, nil
}
func (f *investmentFixtureStore) SaveInvestmentSimulation(_ context.Context, owner, name, kind, snapshot string, config, result json.RawMessage) (json.RawMessage, error) {
	f.owner = owner
	return json.RawMessage(`{"id":"fixture"}`), nil
}
func (f *investmentFixtureStore) InvestmentSimulation(_ context.Context, owner, id string, remove bool) (json.RawMessage, error) {
	f.owner = owner
	return nil, nil
}

type ownedInvestmentFixture struct{ owner string }

func (f *ownedInvestmentFixture) Research(_ context.Context, owner, exchange string) (json.RawMessage, error) {
	f.owner = owner
	return json.RawMessage(`{"riskIntelligence":{"symbols":["OWN"],"weights":[1],"covariance":[[0.001]],"coverage":[{"included":true}],"evidence":{"observations":100},"overview":{"coveredValue":1000,"riskCoveredValue":1000,"positions":[{"symbol":"OWN","sector":"Banking"}]}}}`), nil
}

func TestInvestmentOwnerAndPlanCannotComeFromRequest(t *testing.T) {
	s, _ := fixtureServer()
	store := &investmentFixtureStore{MarketStore: s.Store}
	s.Store = store
	s.Engine = &simulationFixture{}
	for _, plan := range []string{"free", "premium"} {
		w := httptest.NewRecorder()
		s.investment(context.Background(), w, httptest.NewRequest("POST", "/api/v1/engine/investment/calculate?plan=premium_plus", strings.NewReader(`{"kind":"optimization"}`)), &auth.Identity{UserID: "verified", Plan: plan})
		if w.Code != 403 {
			t.Fatal("plan bypass", plan, w.Code)
		}
	}
	w := httptest.NewRecorder()
	s.investment(context.Background(), w, httptest.NewRequest("GET", "/api/v1/engine/investment/simulations?userId=forged", nil), &auth.Identity{UserID: "verified", Plan: "premium_plus"})
	if w.Code != 200 || store.owner != "verified" {
		t.Fatal("owner bypass", w.Code, store.owner)
	}
	w = httptest.NewRecorder()
	s.investment(context.Background(), w, httptest.NewRequest("DELETE", "/api/v1/engine/investment/simulations/11111111-1111-4111-8111-111111111111?userId=forged", nil), &auth.Identity{UserID: "verified", Plan: "premium_plus"})
	if w.Code != 404 || store.owner != "verified" {
		t.Fatal("private identifier leaked", w.Code, store.owner)
	}
}
func TestInvestmentOptimizationUsesOnlyServerOwnedRisk(t *testing.T) {
	s, _ := fixtureServer()
	owned := &ownedInvestmentFixture{}
	worker := &simulationFixture{}
	s.PortfolioResearch = owned
	s.Engine = worker
	w := httptest.NewRecorder()
	s.investment(context.Background(), w, httptest.NewRequest("POST", "/api/v1/engine/investment/optimize-owned?userId=forged", strings.NewReader(`{"objective":"minimum-variance","turnoverCap":1}`)), &auth.Identity{UserID: "verified", Plan: "premium_plus"})
	if w.Code != 200 || owned.owner != "verified" || worker.request.Operation != "investment_research" {
		t.Fatal("owned calculation", w.Code, owned.owner)
	}
	input := worker.request.Args[0].(map[string]any)
	if input["symbols"].([]string)[0] != "OWN" {
		t.Fatal("unowned universe")
	}
	w = httptest.NewRecorder()
	s.investment(context.Background(), w, httptest.NewRequest("POST", "/api/v1/engine/investment/optimize-owned", strings.NewReader(`{"symbols":["FORGED"]}`)), &auth.Identity{UserID: "verified", Plan: "premium_plus"})
	if w.Code != 400 {
		t.Fatal("client covariance override", w.Code)
	}
}
func TestBasicMacroCannotReadHistoricalPremiumSeries(t *testing.T) {
	s, _ := fixtureServer()
	store := &investmentFixtureStore{MarketStore: s.Store}
	worker := &simulationFixture{}
	s.Store = store
	s.Engine = worker
	w := httptest.NewRecorder()
	s.investment(context.Background(), w, httptest.NewRequest("GET", "/api/v1/engine/investment/evidence?kind=macro&asOf=2020-01-01", nil), &auth.Identity{UserID: "verified", Plan: "free"})
	if w.Code != 403 || store.kind != "" {
		t.Fatal("historical entitlement bypass", w.Code)
	}
	w = httptest.NewRecorder()
	s.investment(context.Background(), w, httptest.NewRequest("GET", "/api/v1/engine/investment/evidence?kind=macro&asOf="+time.Now().UTC().Format("2006-01-02"), nil), &auth.Identity{UserID: "verified", Plan: "free"})
	if w.Code != 200 || worker.request.Args[0].(map[string]any)["basic"] != true {
		t.Fatal("basic projection", w.Code)
	}
}
