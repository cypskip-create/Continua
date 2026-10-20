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

type ownedRiskFixture struct {
	owner string
	calls int
}

func (f *ownedRiskFixture) Research(_ context.Context, owner, exchange string) (json.RawMessage, error) {
	f.owner = owner
	f.calls++
	return json.RawMessage(`{"riskIntelligence":{"version":"owned-snapshot"}}`), nil
}

type simulationFixture struct{ request engine.Request }

func (f *simulationFixture) Calculate(_ context.Context, r engine.Request) (json.RawMessage, error) {
	f.request = r
	return json.RawMessage(`{"status":200,"data":{"simulation":true}}`), nil
}
func TestRiskSimulationUsesVerifiedOwnerAndServerSnapshot(t *testing.T) {
	s, _ := fixtureServer()
	owned := &ownedRiskFixture{}
	worker := &simulationFixture{}
	s.PortfolioResearch = owned
	s.Engine = worker
	for _, plan := range []string{"free", "premium", "premium_plus"} {
		r := httptest.NewRequest("POST", "/api/v1/engine/labs/intelligence?userId=forged", strings.NewReader(`{"weights":{}}`))
		w := httptest.NewRecorder()
		s.riskLabs(context.Background(), w, r, &auth.Identity{UserID: "verified-owner", Plan: plan})
		if plan != "premium_plus" {
			if w.Code != 403 || owned.calls != 0 {
				t.Fatal("entitlement bypass", plan, w.Code)
			}
			continue
		}
		if w.Code != 200 || owned.owner != "verified-owner" || worker.request.Operation != "risk_simulation" {
			t.Fatal("unverified simulation", w.Code, owned.owner)
		}
		if string(worker.request.Args[0].(json.RawMessage)) != `{"version":"owned-snapshot"}` {
			t.Fatal("client supplied risk snapshot")
		}
	}
}
func TestStockRiskRequiresPremiumBeforeReadingData(t *testing.T) {
	s, _ := fixtureServer()
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/engine/risk/KCB", nil)
	if !s.stockRisk(context.Background(), w, r, &auth.Identity{UserID: "free", Plan: "free"}) || w.Code != 403 {
		t.Fatal("stock risk gate", w.Code)
	}
}
