package httpapi

import (
	"testing"
	"time"
)

func TestRateConfigurationHasIndependentPreAuthenticationWindow(t *testing.T) {
	server := New(nil, nil)
	env := map[string]string{"RATE_LIMIT_WINDOW_MS": "1500", "RATE_LIMIT_MAX_DEFAULT": "9"}
	if err := server.ConfigureRateLimits(func(key string) string { return env[key] }); err != nil {
		t.Fatal(err)
	}
	if server.defaultRateLimit != 9 || server.preLimiter.duration != time.Minute || server.limiter.duration != 1500*time.Millisecond || server.limiter.RetryAfter() != "2" {
		t.Fatal("rate boundaries not preserved")
	}
	now := time.Now()
	if !server.limiter.Allow("fixture", 1, now) || server.limiter.Allow("fixture", 1, now.Add(time.Second)) || !server.limiter.Allow("fixture", 1, now.Add(1500*time.Millisecond)) {
		t.Fatal("configured rate window not honored")
	}
	for _, value := range []string{"0", "-1", "garbage", "3600001"} {
		if server.ConfigureRateLimits(func(key string) string {
			if key == "RATE_LIMIT_WINDOW_MS" {
				return value
			}
			return ""
		}) == nil {
			t.Fatal("invalid window accepted")
		}
	}
}
