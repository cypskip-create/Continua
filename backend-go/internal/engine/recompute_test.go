package engine

import (
	"math"
	"testing"
	"time"
)

func TestResearchRecomputeRejectsStaleFutureMockAndInvalidQuotes(t *testing.T) {
	now := time.Date(2026, 10, 15, 12, 0, 0, 0, time.UTC)
	if !usableResearchQuote(now.Add(-3*24*time.Hour), now, 90, "delayed") {
		t.Fatal("valid dated quote rejected")
	}
	for _, tc := range []struct {
		at     time.Time
		price  float64
		source string
	}{
		{now.Add(-7 * 24 * time.Hour), 90, "delayed"}, {now.Add(time.Second), 90, "live"},
		{now, 90, "mock"}, {now, 0, "live"}, {now, math.Inf(1), "live"}, {now, math.NaN(), "live"},
	} {
		if usableResearchQuote(tc.at, now, tc.price, tc.source) {
			t.Fatal("unusable quote admitted for recomputation")
		}
	}
}
