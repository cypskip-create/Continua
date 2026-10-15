package marketdata

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestHistoricalObservationRequiresRealCompleteRange(t *testing.T) {
	now := time.Date(2026, 10, 15, 0, 0, 0, 0, time.UTC)
	base := HistoricalObservation{Symbol: "KCB", Date: "2026-10-12", Currency: "KES", Open: 90, High: 92, Low: 89, Close: 91, Volume: 100, SourceURL: "https://www.nse.co.ke/report.pdf", PermissionReference: "operator:covered", Adjustment: "unadjusted"}
	if err := base.validate(now); err != nil {
		t.Fatal(err)
	}
	for _, change := range []func(*HistoricalObservation){
		func(r *HistoricalObservation) { r.Date = "2026-02-30" },
		func(r *HistoricalObservation) { r.Date = "2026-10-16" },
		func(r *HistoricalObservation) { r.Date = "2014-12-31" },
		func(r *HistoricalObservation) { r.Open = 0 },
		func(r *HistoricalObservation) { r.High = 90 },
		func(r *HistoricalObservation) { r.Volume = -1 },
		func(r *HistoricalObservation) { r.Adjustment = "adjusted" },
		func(r *HistoricalObservation) { r.PermissionReference = "  " },
		func(r *HistoricalObservation) { r.SourceURL = "https://secret@www.nse.co.ke/report.pdf" },
		func(r *HistoricalObservation) { r.Symbol = "KCB;DROP" },
	} {
		row := base
		change(&row)
		if row.validate(now) == nil {
			t.Fatalf("accepted invalid observation: %+v", row)
		}
	}
}

func TestReviewedResearchOfficialDomainAndPayload(t *testing.T) {
	base := `{"id":"official-test","kind":"market_statistics","title":"NSE index","symbol":null,"observedAt":"2026-10-12T00:00:00Z","sourceUrl":"https://www.nse.co.ke/report.pdf","payload":{"indicator":"NASI","actual":244.93,"unit":"points","permissionReference":"operator:covered"}}`
	store := &Store{}
	count, err := store.ImportResearch(context.Background(), strings.NewReader(baseArray(base)), false, time.Now())
	if err != nil || count != 1 {
		t.Fatalf("valid offline import rejected: %v %d", err, count)
	}
	for _, raw := range []string{
		strings.Replace(base, "www.nse.co.ke", "nse.co.ke.attacker.example", 1),
		strings.Replace(base, "\"permissionReference\":\"operator:covered\"", "\"invented\":1", 1),
		strings.Replace(base, "244.93", "null", 1),
		strings.Replace(base, "244.93", "true", 1),
		strings.Replace(base, "\"unit\":\"points\",", "", 1),
		strings.Replace(base, "\"kind\":\"market_statistics\"", "\"kind\":\"trade\"", 1),
		strings.Replace(base, "2026-10-12T00:00:00Z", "not-a-date", 1),
	} {
		if _, err := store.ImportResearch(context.Background(), strings.NewReader(baseArray(raw)), false, time.Now()); err == nil {
			t.Fatal("accepted invalid official research")
		}
	}
	if _, err := store.ImportResearch(context.Background(), strings.NewReader("["+base+","+base+"]"), false, time.Now()); err == nil {
		t.Fatal("accepted duplicate observation IDs")
	}
	if _, err := store.ImportResearch(context.Background(), strings.NewReader(baseArray(base)+" {}"), false, time.Now()); err == nil {
		t.Fatal("accepted trailing payload")
	}
}

func baseArray(record string) string { return "[" + record + "]" }

func TestReviewedResearchRetainsNullableSymbol(t *testing.T) {
	var record ReviewedResearch
	if err := json.Unmarshal([]byte(`{"id":"macro","kind":"macro","title":"Official CPI","observedAt":"2026-10-12T00:00:00+03:00","sourceUrl":"https://knbs.or.ke/release","payload":{"actual":0,"indicator":"CPI","unit":"percent"}}`), &record); err != nil {
		t.Fatal(err)
	}
	if err := record.validate(); err != nil || record.Symbol != nil {
		t.Fatalf("valid missing symbol or zero observation lost: %v", err)
	}
}
