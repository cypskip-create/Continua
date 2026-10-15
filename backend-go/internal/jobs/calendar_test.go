package jobs

import (
	"testing"
	"time"
)

func TestCalendarUsesNairobiBoundariesAndRetainedHolidayList(t *testing.T) {
	for _, tc := range []struct {
		at   string
		open bool
	}{{"2026-10-14T06:29:59Z", false}, {"2026-10-14T06:30:00Z", true}, {"2026-10-14T11:59:59Z", true}, {"2026-10-14T12:00:00Z", false}, {"2026-10-20T07:00:00Z", false}, {"2026-10-17T07:00:00Z", false}} {
		at, _ := time.Parse(time.RFC3339, tc.at)
		if MarketOpen("NSE", at, false) != tc.open {
			t.Fatal(tc)
		}
	}
	if !MarketOpen("NSE", time.Time{}, true) {
		t.Fatal("explicit calendar override lost")
	}
}
