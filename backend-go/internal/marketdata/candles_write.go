package marketdata

import (
	"context"
	"errors"
	"fmt"
	"math"
	"net/url"
	"sort"
	"strings"
	"time"
)

type CandleInput struct {
	SecurityID string   `json:"securityId"`
	Interval   string   `json:"interval"`
	Timestamp  string   `json:"timestamp"`
	Open       *float64 `json:"open"`
	High       *float64 `json:"high"`
	Low        *float64 `json:"low"`
	Close      *float64 `json:"close"`
	Volume     *float64 `json:"volume"`
	SourceURL  *string  `json:"sourceUrl"`
}

// Collector publication always requires source-backed complete observations.
func (c CandleInput) Validate(now time.Time) error { return c.validate(now, false) }

func (c CandleInput) validate(now time.Time, unreviewed bool) error {
	if !strings.HasPrefix(c.SecurityID, "NSE:") || len(c.SecurityID) <= 4 || len(c.SecurityID) > 24 || !map[string]bool{"1m": true, "5m": true, "15m": true, "1h": true, "1d": true, "1w": true, "1M": true, "1y": true}[c.Interval] {
		return errors.New("invalid candle identity")
	}
	at, e := time.Parse(time.RFC3339Nano, c.Timestamp)
	if e != nil || at.After(now) {
		return errors.New("past candle timestamp required")
	}
	for _, v := range []*float64{c.Open, c.High, c.Low, c.Close, c.Volume} {
		if v == nil || math.IsNaN(*v) || math.IsInf(*v, 0) || *v < 0 {
			return errors.New("literal candle observations required")
		}
	}
	if *c.High < *c.Low || *c.Open < *c.Low || *c.Open > *c.High || *c.Close < *c.Low || *c.Close > *c.High {
		return errors.New("inconsistent candle range")
	}
	if c.SourceURL == nil {
		if !unreviewed {
			return errors.New("candle provenance required")
		}
		return nil
	}
	u, e := url.Parse(*c.SourceURL)
	if e != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil || len(*c.SourceURL) > 4096 {
		return errors.New("invalid candle provenance")
	}
	return nil
}

// All bounded chunks share one transaction. Validate before any SQL; preserve
// source-backed rows when an explicitly permitted unreviewed import lacks provenance.
func (s *Store) UpsertCandlesBatch(ctx context.Context, input []CandleInput, now time.Time) error {
	if len(input) > 10000 {
		return errors.New("candle batch limit")
	}
	if len(input) == 0 {
		return nil
	}
	candles := append([]CandleInput(nil), input...)
	seen := map[string]bool{}
	for _, c := range candles {
		if e := c.validate(now, s.AllowUnreviewed); e != nil {
			return e
		}
		at, _ := time.Parse(time.RFC3339Nano, c.Timestamp)
		key := c.SecurityID + "|" + c.Interval + "|" + at.UTC().Format(time.RFC3339Nano)
		if seen[key] {
			return errors.New("duplicate candle key")
		}
		seen[key] = true
	}
	sort.Slice(candles, func(i, j int) bool {
		a, b := candles[i], candles[j]
		return a.SecurityID+"|"+a.Interval+"|"+a.Timestamp < b.SecurityID+"|"+b.Interval+"|"+b.Timestamp
	})
	tx, e := s.DB.BeginTx(ctx, nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	for start := 0; start < len(candles); start += 500 {
		end := start + 500
		if end > len(candles) {
			end = len(candles)
		}
		args := []any{}
		rows := []string{}
		for _, c := range candles[start:end] {
			base := len(args)
			args = append(args, c.SecurityID, c.Interval, c.Timestamp, c.Open, c.High, c.Low, c.Close, c.Volume, c.SourceURL)
			p := []string{}
			for i := 1; i <= 9; i++ {
				p = append(p, fmt.Sprintf("$%d", base+i))
			}
			rows = append(rows, "("+strings.Join(p, ",")+")")
		}
		_, e = tx.ExecContext(ctx, `INSERT INTO market.candles (security_id,interval,bar_time,open,high,low,close,volume,source_url) VALUES `+strings.Join(rows, ",")+` ON CONFLICT(security_id,interval,bar_time) DO UPDATE SET open=EXCLUDED.open,high=EXCLUDED.high,low=EXCLUDED.low,close=EXCLUDED.close,volume=EXCLUDED.volume,source_url=EXCLUDED.source_url WHERE (EXCLUDED.source_url IS NOT NULL OR candles.source_url IS NULL) AND (candles.open,candles.high,candles.low,candles.close,candles.volume,candles.source_url) IS DISTINCT FROM (EXCLUDED.open,EXCLUDED.high,EXCLUDED.low,EXCLUDED.close,EXCLUDED.volume,EXCLUDED.source_url)`, args...)
		if e != nil {
			return e
		}
	}
	return tx.Commit()
}
