package jobs

import (
	"time"
	_ "time/tzdata"
)

// Compatibility calendar, not a newly verified exchange holiday feed. This
// representative 2026 list still requires operator annual upkeep.
var kenyaHolidays = map[string]bool{"2026-01-01": true, "2026-04-03": true, "2026-04-06": true, "2026-05-01": true, "2026-06-01": true, "2026-10-20": true, "2026-12-12": true, "2026-12-25": true, "2026-12-26": true}

func TradingDay(exchange string, at time.Time) bool {
	if exchange != "NSE" {
		return true
	}
	zone, _ := time.LoadLocation("Africa/Nairobi")
	local := at.In(zone)
	return local.Weekday() != time.Saturday && local.Weekday() != time.Sunday && !kenyaHolidays[local.Format("2006-01-02")]
}
func MarketOpen(exchange string, at time.Time, ignore bool) bool {
	if ignore || exchange != "NSE" {
		return true
	}
	if !TradingDay(exchange, at) {
		return false
	}
	zone, _ := time.LoadLocation("Africa/Nairobi")
	local := at.In(zone)
	minutes := local.Hour()*60 + local.Minute()
	return minutes >= 570 && minutes < 900
}
