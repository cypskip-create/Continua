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
