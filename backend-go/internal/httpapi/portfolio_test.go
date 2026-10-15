package httpapi

import (
	"context"
	"continua/backend/internal/auth"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"
)

type portfolioFixture struct {
	MarketStore
	owner string
	calls int
	fail  bool
}

type portfolioResearchFixture struct {
	owner string
	calls int
}

func (p *portfolioResearchFixture) Research(_ context.Context, owner, exchange string) (json.RawMessage, error) {
	p.owner = owner
	p.calls++
	return json.RawMessage(`{"positions":[]}`), nil
}
func TestPortfolioResearchUsesVerifiedOwnerAndPlusGate(t *testing.T) {
	s, _ := fixtureServer()
	p := new(portfolioResearchFixture)
	s.PortfolioResearch = p
	for _, plan := range []string{"free", "premium_plus"} {
		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", "/api/v1/engine/portfolio?userId=other-owner", nil)
		s.portfolioResearch(context.Background(), w, r, &auth.Identity{UserID: "verified-owner", Plan: plan})
		if plan == "free" {
			if w.Code != 403 || p.calls != 0 {
				t.Fatal("entitlement bypass")
			}
		} else if w.Code != 200 || p.owner != "verified-owner" || p.calls != 1 {
			t.Fatal("unverified owner reached workspace")
		}
	}
}

func (p *portfolioFixture) PortfolioPositions(_ context.Context, owner, exchange string) ([]json.RawMessage, error) {
	p.owner = owner
	p.calls++
	if p.fail {
		return nil, errors.New("private DB failure details")
	}
	return []json.RawMessage{}, nil
}
func TestPortfolioOverviewFreeButVerifiedOwnerOnly(t *testing.T) {
	s, _ := fixtureServer()
	store := &portfolioFixture{MarketStore: s.Store}
	s.Store = store
	s.Engine = &calculationFixture{raw: json.RawMessage(`{"holdingCount":0}`)}
	r := httptest.NewRequest("GET", "/api/v1/engine/portfolio/overview?userId=other-owner", nil)
	w := httptest.NewRecorder()
	s.portfolioOverview(context.Background(), w, r, nil, "NSE")
	if w.Code != 401 || store.calls != 0 {
		t.Fatal("anonymous access")
	}
	w = httptest.NewRecorder()
	s.portfolioOverview(context.Background(), w, r, &auth.Identity{UserID: "verified-owner", Plan: "free"}, "NSE")
	if w.Code != 200 || store.owner != "verified-owner" || store.calls != 1 {
		t.Fatal(w.Code, store.owner)
	}
	store.fail = true
	w = httptest.NewRecorder()
	s.portfolioOverview(context.Background(), w, r, &auth.Identity{UserID: "verified-owner", Plan: "free"}, "NSE")
	if w.Code != 503 || strings.Contains(w.Body.String(), "private DB") {
		t.Fatal("outage leaked or hidden")
	}
}
