package httpapi

import (
	"continua/backend/internal/jobs"
	"encoding/json"
	"time"
)

// Inspect every served quote, not the time it entered a cache. Emit one bounded
// summary per response rather than a log line for every requested issuer.
func (s *Server) checkQuoteFreshness(rows []json.RawMessage, now time.Time) {
	if s.QuoteWarning == nil || !jobs.MarketOpen("NSE", now, s.IgnoreCalendar) {
		return
	}
	stale := 0
	oldest := time.Duration(0)
	for _, raw := range rows {
		var quote struct {
			Timestamp string `json:"timestamp"`
		}
		if json.Unmarshal(raw, &quote) != nil {
			continue
		}
		at, err := time.Parse(time.RFC3339Nano, quote.Timestamp)
		if err != nil {
			continue
		}
		age := now.Sub(at)
		if age > 15*time.Minute {
			stale++
			if age > oldest {
				oldest = age
			}
		}
	}
	if stale > 0 {
		s.QuoteWarning(stale, oldest)
	}
}
