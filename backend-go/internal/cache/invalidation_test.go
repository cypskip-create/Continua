package cache

import (
	"context"
	"encoding/json"
	"testing"
	"time"
)

func TestInvalidatedFlightCannotRestoreOldFiling(t *testing.T) {
	for _, prefix := range []bool{false, true} {
		c := NewMemory()
		started, release, finished := make(chan struct{}), make(chan struct{}), make(chan struct{})
		go func() {
			defer close(finished)
			_, _ = c.GetOrLoad(context.Background(), "financial-read:NSE:KCB:annual", time.Minute, func(context.Context) (json.RawMessage, error) {
				close(started)
				<-release
				return json.RawMessage(`{"year":2021}`), nil
			})
		}()
		<-started
		if prefix {
			c.DeletePrefix("financial-read:NSE:KCB:")
		} else {
			c.Delete("financial-read:NSE:KCB:annual")
		}
		close(release)
		<-finished
		if c.Get("financial-read:NSE:KCB:annual") != nil {
			t.Fatal("invalidated filing restored")
		}
		raw, err := c.GetOrLoad(context.Background(), "financial-read:NSE:KCB:annual", time.Minute, func(context.Context) (json.RawMessage, error) { return json.RawMessage(`{"year":2025}`), nil })
		if err != nil || string(raw) != `{"year":2025}` {
			t.Fatal(string(raw), err)
		}
	}
}

func TestExplicitNewValueWinsOverEarlierFlight(t *testing.T) {
	c := NewMemory()
	started, release, finished := make(chan struct{}), make(chan struct{}), make(chan struct{})
	go func() {
		defer close(finished)
		_, _ = c.GetOrLoad(context.Background(), "ratios:NSE:KCB", time.Minute, func(context.Context) (json.RawMessage, error) {
			close(started)
			<-release
			return json.RawMessage(`{"pe":7}`), nil
		})
	}()
	<-started
	c.Set("ratios:NSE:KCB", json.RawMessage(`{"pe":13}`), time.Minute)
	close(release)
	<-finished
	if string(c.Get("ratios:NSE:KCB")) != `{"pe":13}` {
		t.Fatal("old calculation replaced explicit value")
	}
}
