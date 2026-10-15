package httpapi

import (
	"context"
	"continua/backend/internal/auth"
	"encoding/json"
	"net/http/httptest"
	"testing"
)

type peerFixture struct {
	MarketStore
	calls int
}

func (p *peerFixture) CompanyProfile(context.Context, string, string) (json.RawMessage, error) {
	p.calls++
	return json.RawMessage(`{"currency":"KES","company":{"sectorName":"Banking"}}`), nil
}
func (p *peerFixture) Instruments(context.Context, string) ([]json.RawMessage, error) {
	return []json.RawMessage{json.RawMessage(`{"symbol":"KCB","securityId":"NSE:KCB","sector":"Banking","currency":"KES"}`), json.RawMessage(`{"symbol":"ABSA","securityId":"NSE:ABSA","companyName":"Absa","sector":"Banking","currency":"KES"}`), json.RawMessage(`{"symbol":"OTHER","securityId":"NSE:OTHER","sector":"Banking","currency":"USD"}`)}, nil
}
func (p *peerFixture) Ratios(context.Context, string) (json.RawMessage, error) { return nil, nil }
func (p *peerFixture) FinancialHistory(context.Context, string, string, int) ([]json.RawMessage, error) {
	return []json.RawMessage{}, nil
}
func TestPeersEntitlementCurrencyAndMissingValues(t *testing.T) {
	s, _ := fixtureServer()
	p := &peerFixture{MarketStore: s.Store}
	s.Store = p
	s.Engine = &calculationFixture{raw: json.RawMessage(`{"period":null,"metrics":{}}`)}
	for _, plan := range []string{"free", "premium_plus"} {
		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", "/api/v1/engine/peers?symbol=kcb", nil)
		s.peers(context.Background(), w, r, &auth.Identity{UserID: "verified", Plan: plan})
		if plan == "free" {
			if w.Code != 403 || p.calls != 0 {
				t.Fatal("peer access bypass")
			}
			continue
		}
		var response struct {
			Data []struct {
				Symbol string
				Ratios json.RawMessage
			}
		}
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &response) != nil || len(response.Data) != 1 || response.Data[0].Symbol != "ABSA" || string(response.Data[0].Ratios) != "null" {
			t.Fatal(w.Code, w.Body.String())
		}
	}
}
