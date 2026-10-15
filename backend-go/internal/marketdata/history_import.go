package marketdata

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"math"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"
)

type HistoricalObservation struct {
	Symbol              string  `json:"symbol"`
	Date                string  `json:"date"`
	Currency            string  `json:"currency"`
	Open                float64 `json:"open"`
	High                float64 `json:"high"`
	Low                 float64 `json:"low"`
	Close               float64 `json:"close"`
	Volume              int64   `json:"volume"`
	SourceURL           string  `json:"sourceUrl"`
	PermissionReference string  `json:"permissionReference"`
	Adjustment          string  `json:"adjustment"`
}

type HistoryImportResult struct {
	Observations int  `json:"observations"`
	Applied      bool `json:"applied"`
}

// ImportHistorical consumes bounded JSON in chunks, not an entire 200,000-row
// file in memory. Every chunk shares one transaction. A conflicting existing
// price or concurrent writer aborts the whole import, never silently overwrites.
func (s *Store) ImportHistorical(ctx context.Context, input io.Reader, apply bool, now time.Time) (*HistoryImportResult, error) {
	if s.DB == nil {
		return nil, errors.New("history import storage unavailable")
	}
	decoder := json.NewDecoder(io.LimitReader(input, 64*1024*1024+1))
	decoder.DisallowUnknownFields()
	first, err := decoder.Token()
	if err != nil || first != json.Delim('[') {
		return nil, errors.New("historical observation array required")
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	result := &HistoryImportResult{Applied: apply}
	seen := map[string]bool{}
	for decoder.More() {
		chunk := make([]HistoricalObservation, 0, 500)
		for decoder.More() && len(chunk) < 500 {
			var observation HistoricalObservation
			if decoder.Decode(&observation) != nil || observation.validate(now) != nil {
				return nil, errors.New("invalid historical observation")
			}
			key := observation.Symbol + ":" + observation.Date
			if seen[key] {
				return nil, errors.New("duplicate historical observation")
			}
			seen[key] = true
			result.Observations++
			if result.Observations > 200000 {
				return nil, errors.New("historical observation budget exceeded")
			}
			chunk = append(chunk, observation)
		}
		if err := importHistoricalChunk(ctx, tx, chunk, apply); err != nil {
			return nil, err
		}
	}
	last, err := decoder.Token()
	if err != nil || last != json.Delim(']') || result.Observations == 0 {
		return nil, errors.New("nonempty complete historical array required")
	}
	if decoder.Decode(new(any)) != io.EOF || decoder.InputOffset() > 64*1024*1024 {
		return nil, errors.New("history input exceeds budget or has trailing data")
	}
	if apply {
		if err = tx.Commit(); err != nil {
			return nil, err
		}
	}
	return result, nil
}

func (r HistoricalObservation) validate(now time.Time) error {
	if !regexp.MustCompile(`^[A-Z][A-Z0-9]{0,19}$`).MatchString(r.Symbol) || r.Currency != "KES" || r.Adjustment != "unadjusted" || len(strings.TrimSpace(r.PermissionReference)) < 1 || len(r.PermissionReference) > 200 {
		return errors.New("history identity, currency or rights unavailable")
	}
	at, err := time.Parse("2006-01-02", r.Date)
	if err != nil || r.Date < "2015-01-01" || at.After(now.UTC()) {
		return errors.New("history date unavailable")
	}
	for _, value := range []float64{r.Open, r.High, r.Low, r.Close} {
		if value <= 0 || math.IsNaN(value) || math.IsInf(value, 0) {
			return errors.New("literal positive prices required")
		}
	}
	if r.Volume < 0 || r.Volume > 9007199254740991 || r.High < math.Max(r.Open, math.Max(r.Close, r.Low)) || r.Low > math.Min(r.Open, r.Close) {
		return errors.New("inconsistent historical range")
	}
	u, err := url.Parse(r.SourceURL)
	if err != nil || len(r.SourceURL) > 4096 || u.Scheme != "https" || u.Hostname() == "" || u.User != nil {
		return errors.New("HTTPS source provenance required")
	}
	return nil
}

func importHistoricalChunk(ctx context.Context, tx *sql.Tx, chunk []HistoricalObservation, apply bool) error {
	sort.Slice(chunk, func(i, j int) bool { return chunk[i].Symbol+chunk[i].Date < chunk[j].Symbol+chunk[j].Date })
	raw, err := json.Marshal(chunk)
	if err != nil {
		return err
	}
	const observed = `WITH input AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS i(symbol text,date date,open numeric,high numeric,low numeric,close numeric,volume bigint,"sourceUrl" text,"permissionReference" text,adjustment text)), resolved AS (SELECT i.*,s.id AS security_id FROM input i JOIN market.securities s ON s.symbol=i.symbol AND s.exchange='NSE' AND s.status='active') `
	var resolved int
	if err = tx.QueryRowContext(ctx, observed+`SELECT count(*) FROM resolved`, string(raw)).Scan(&resolved); err != nil {
		return err
	}
	if resolved != len(chunk) {
		return errors.New("unknown active NSE history ticker")
	}
	if !apply {
		return nil
	}
	// DO NOTHING serializes the unique key against concurrent imports. Its
	// subsequent comparison sees the winning committed row under READ COMMITTED.
	_, err = tx.ExecContext(ctx, observed+`INSERT INTO market.candles(security_id,interval,bar_time,open,high,low,close,volume,source_url)
 SELECT security_id,'1d',date::timestamp AT TIME ZONE 'UTC',open,high,low,close,volume,"sourceUrl" FROM resolved ORDER BY security_id,date
 ON CONFLICT(security_id,interval,bar_time) DO NOTHING`, string(raw))
	if err != nil {
		return err
	}
	var matches bool
	err = tx.QueryRowContext(ctx, observed+`SELECT count(*)=$2 AND bool_and((c.open,c.high,c.low,c.close,c.volume) IS NOT DISTINCT FROM (r.open,r.high,r.low,r.close,r.volume))
 FROM resolved r JOIN market.candles c ON c.security_id=r.security_id AND c.interval='1d' AND c.bar_time=r.date::timestamp AT TIME ZONE 'UTC'`, string(raw), len(chunk)).Scan(&matches)
	if err != nil {
		return err
	}
	if !matches {
		return errors.New("conflicting stored historical observation requires separate review")
	}
	_, err = tx.ExecContext(ctx, observed+`INSERT INTO market.price_history_sources(security_id,bar_time,source_url,permission_reference,adjustment)
 SELECT security_id,date::timestamp AT TIME ZONE 'UTC',"sourceUrl","permissionReference",adjustment FROM resolved
 ON CONFLICT(security_id,bar_time,source_url) DO NOTHING`, string(raw))
	return err
}
