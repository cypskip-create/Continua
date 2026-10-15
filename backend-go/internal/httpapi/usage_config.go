package httpapi

import (
	"errors"
	"math"
	"strconv"
)

func (s *Server) ConfigureUsage(get func(string) string) error {
	if raw := get("ENGINE_AI_MONTHLY_BUDGET_USD"); raw != "" {
		v, e := strconv.ParseFloat(raw, 64)
		if e != nil || math.IsNaN(v) || math.IsInf(v, 0) || v < 0 || v > 1000 {
			return errors.New("invalid AI accounting cap")
		}
		s.AIMonthlyCap = v
	}
	if raw := get("ENGINE_AI_USER_DAILY_LIMIT"); raw != "" {
		v, e := strconv.Atoi(raw)
		if e != nil || v < 0 || v > 100 {
			return errors.New("invalid AI accounting limit")
		}
		s.AIDailyLimit = v
	}
	return nil
}
