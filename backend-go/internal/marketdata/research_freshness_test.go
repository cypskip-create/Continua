package marketdata

import (
	"context"
	"encoding/json"
	"github.com/DATA-DOG/go-sqlmock"
	"testing"
)

func TestQuoteOrFilingRefreshPreventsOldRatioBeingPresentedAsCurrent(t *testing.T) {
	s, m := mockStore(t)
	raw := json.RawMessage(`{"securityId":"NSE:KCB","asOf":"2026-10-14T09:00:00Z"}`)
	score, e := WithNativeResearchBasis(raw, raw, "fixture-basis", 90)
	if e != nil {
		t.Fatal(e)
	}
	m.ExpectQuery(`SELECT q.event_timestamp=\$2.*NOT EXISTS.*native_research_refresh`).WithArgs("NSE:KCB", "2026-10-14T09:00:00Z", 90.0, "fixture-basis").WillReturnRows(sqlmock.NewRows([]string{"current"}).AddRow(false))
	current, e := s.ResearchIsCurrent(context.Background(), "NSE:KCB", raw, score)
	if e != nil || current {
		t.Fatal(current, e)
	}
	other := json.RawMessage(`{"securityId":"NSE:ABSA","asOf":"2026-10-14T09:00:00Z"}`)
	current, e = s.ResearchIsCurrent(context.Background(), "NSE:KCB", raw, other)
	if e != nil || current {
		t.Fatal("mixed issuer research accepted")
	}
}

func TestLegacyOrMixedRatioPayloadIsNotCurrentNativeResearch(t *testing.T) {
	s, _ := mockStore(t)
	ratios := json.RawMessage(`{"securityId":"NSE:KCB","asOf":"2026-10-14T09:00:00Z","pe":7.73}`)
	score := json.RawMessage(`{"securityId":"NSE:KCB","asOf":"2026-10-14T09:00:00Z","inputs":{}}`)
	if current, err := s.ResearchIsCurrent(context.Background(), "NSE:KCB", ratios, score); err != nil || current {
		t.Fatal("unmarked compatibility record accepted")
	}
	marked, err := WithNativeResearchBasis(ratios, score, "fixture-version", 90)
	if err != nil {
		t.Fatal(err)
	}
	altered := json.RawMessage(`{"securityId":"NSE:KCB","asOf":"2026-10-14T09:00:00Z","pe":13.96}`)
	if current, err := s.ResearchIsCurrent(context.Background(), "NSE:KCB", altered, marked); err != nil || current {
		t.Fatal("mixed PE values accepted")
	}
}
