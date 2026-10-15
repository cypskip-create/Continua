package httpapi

import (
	"errors"
	"strconv"
	"time"
)

// ConfigureRateLimits runs before serving. Authentication and pre-authentication
// have independent windows; the one-minute pre-auth boundary never rate-limits
// a signed payment webhook before its signature can be verified.
func (s *Server) ConfigureRateLimits(getenv func(string) string) error {
	windowMS, limit := 60000, 120
	var err error
	if value := getenv("RATE_LIMIT_WINDOW_MS"); value != "" {
		windowMS, err = strconv.Atoi(value)
		if err != nil || windowMS < 1 || windowMS > 3600000 {
			return errors.New("invalid rate-limit window")
		}
	}
	if value := getenv("RATE_LIMIT_MAX_DEFAULT"); value != "" {
		limit, err = strconv.Atoi(value)
		if err != nil || limit < 1 || limit > 100000 {
			return errors.New("invalid default rate limit")
		}
	}
	s.defaultRateLimit = limit
	s.limiter = &Limiter{windows: map[string]window{}, duration: time.Duration(windowMS) * time.Millisecond}
	s.preLimiter = NewLimiter()
	return nil
}

func (l *Limiter) RetryAfter() string {
	duration := l.duration
	if duration <= 0 {
		duration = time.Minute
	}
	seconds := (duration + time.Second - 1) / time.Second
	return strconv.FormatInt(int64(seconds), 10)
}
