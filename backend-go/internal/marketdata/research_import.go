package marketdata

import (
	"context"
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

type ReviewedResearch struct {
	ID         string                     `json:"id"`
	Kind       string                     `json:"kind"`
	Title      string                     `json:"title"`
	Symbol     *string                    `json:"symbol"`
	ObservedAt string                     `json:"observedAt"`
	SourceURL  string                     `json:"sourceUrl"`
	Payload    map[string]json.RawMessage `json:"payload"`
}

func (r ReviewedResearch) validate() error {
	if len(r.ID) < 1 || len(r.ID) > 180 || len(r.Title) < 1 || len(r.Title) > 300 || !map[string]bool{"ipo": true, "macro": true, "economic": true, "bond": true, "derivative": true, "usp": true, "market_statistics": true}[r.Kind] || (r.Symbol != nil && len(*r.Symbol) > 20) || r.Payload == nil {
		return errors.New("invalid reviewed research identity")
	}
	if _, err := time.Parse(time.RFC3339Nano, r.ObservedAt); err != nil {
		return errors.New("dated research observation required")
	}
	u, err := url.Parse(r.SourceURL)
	if err != nil || len(r.SourceURL) > 4096 || u.Scheme != "https" || u.User != nil {
		return errors.New("official HTTPS research source required")
	}
	host := strings.ToLower(u.Hostname())
	official := false
	for _, domain := range []string{"centralbank.go.ke", "knbs.or.ke", "nse.co.ke", "cma.or.ke"} {
		if host == domain || strings.HasSuffix(host, "."+domain) {
			official = true
		}
	}
	if !official {
		return errors.New("official research publisher required")
	}
	numbers := map[string]bool{"price": true, "shares": true, "actual": true, "previous": true, "consensus": true, "importance": true, "tenor": true, "coupon": true, "yield": true, "volume": true, "openInterest": true, "turnover": true, "change": true}
	positive := map[string]bool{"price": true, "shares": true, "tenor": true}
	nonnegative := map[string]bool{"coupon": true, "volume": true, "openInterest": true, "turnover": true}
	stringsAllowed := map[string]int{"status": 100, "date": 100, "unit": 40, "maturity": 100, "yieldBasis": 100, "indicator": 100, "isin": 12, "expiry": 100, "permissionReference": 200}
	for key, raw := range r.Payload {
		if numbers[key] {
			var value *float64
			if json.Unmarshal(raw, &value) != nil || value == nil || math.IsNaN(*value) || math.IsInf(*value, 0) || (positive[key] && *value <= 0) || (nonnegative[key] && *value < 0) {
				return errors.New("literal finite research value required")
			}
			if (key == "volume" || key == "openInterest" || key == "importance") && math.Trunc(*value) != *value {
				return errors.New("integral research count required")
			}
			if key == "importance" && (*value < 1 || *value > 3) {
				return errors.New("invalid research importance")
			}
			continue
		}
		limit, known := stringsAllowed[key]
		if !known {
			return errors.New("unknown research payload field")
		}
		var value *string
		if json.Unmarshal(raw, &value) != nil || value == nil || len(*value) > limit {
			return errors.New("invalid research text field")
		}
		switch key {
		case "date", "maturity", "expiry":
			if _, err := time.Parse(time.RFC3339Nano, *value); err != nil {
				return errors.New("invalid research calendar date")
			}
		case "status":
			if !map[string]bool{"Available": true, "To be Listed": true, "Listed": true}[*value] {
				return errors.New("invalid research availability")
			}
		case "yieldBasis":
			if *value != "accepted_auction" && *value != "secondary_market" {
				return errors.New("invalid yield basis")
			}
		case "isin":
			if !regexp.MustCompile(`^[A-Z]{2}[A-Z0-9]{9}[0-9]$`).MatchString(*value) {
				return errors.New("invalid research ISIN")
			}
		case "permissionReference":
			if len(strings.TrimSpace(*value)) == 0 {
				return errors.New("written source permission required")
			}
		}
	}
	need := map[string][]string{"derivative": {"price", "expiry", "isin"}, "usp": {"price"}, "market_statistics": {"actual", "indicator", "unit"}, "bond": {"tenor", "yield"}, "macro": {"actual", "indicator", "unit"}, "ipo": {"status"}, "economic": {"date"}}
	for _, key := range need[r.Kind] {
		if r.Payload[key] == nil || string(r.Payload[key]) == `""` {
			return errors.New("required research evidence missing")
		}
	}
	if (host == "nse.co.ke" || strings.HasSuffix(host, ".nse.co.ke")) && map[string]bool{"bond": true, "derivative": true, "usp": true, "market_statistics": true}[r.Kind] && r.Payload["permissionReference"] == nil {
		return errors.New("written NSE permission required")
	}
	return nil
}

// Explicit reviewed import only. Validation is the default and makes no writes.
// The research record and its optional current index update commit together.
func (s *Store) ImportResearch(ctx context.Context, input io.Reader, apply bool, now time.Time) (int, error) {
	decoder := json.NewDecoder(io.LimitReader(input, 4*1024*1024+1))
	decoder.DisallowUnknownFields()
	var records []ReviewedResearch
	if decoder.Decode(&records) != nil || records == nil || len(records) > 2000 || decoder.Decode(new(any)) != io.EOF || decoder.InputOffset() > 4*1024*1024 {
		return 0, errors.New("bounded reviewed research array required")
	}
	seen := map[string]bool{}
	for _, record := range records {
		if record.validate() != nil || seen[record.ID] {
			return 0, errors.New("invalid or duplicate reviewed research record")
		}
		seen[record.ID] = true
	}
	if !apply {
		return len(records), nil
	}
	if s.DB == nil {
		return 0, errors.New("research import storage unavailable")
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	sort.Slice(records, func(i, j int) bool { return records[i].ID < records[j].ID })
	names := map[string]string{"NASI": "NSE All-Share Index", "NSE20": "NSE 20 Share Index", "NSE25": "NSE 25 Share Index", "NSE10": "NSE 10 Share Index"}
	for _, record := range records {
		payload, _ := json.Marshal(record.Payload)
		_, err = tx.ExecContext(ctx, `INSERT INTO market.research_records(id,kind,title,symbol,observed_at,source_url,payload,verified_at)
 VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,now()) ON CONFLICT(id) DO UPDATE SET kind=EXCLUDED.kind,title=EXCLUDED.title,symbol=EXCLUDED.symbol,observed_at=EXCLUDED.observed_at,source_url=EXCLUDED.source_url,payload=EXCLUDED.payload,verified_at=now(),updated_at=now()`, record.ID, record.Kind, record.Title, record.Symbol, record.ObservedAt, record.SourceURL, string(payload))
		if err != nil {
			return 0, err
		}
		u, _ := url.Parse(record.SourceURL)
		var unit, code string
		var value, change float64
		_ = json.Unmarshal(record.Payload["unit"], &unit)
		_ = json.Unmarshal(record.Payload["indicator"], &code)
		if record.Kind != "market_statistics" || unit != "points" || names[code] == "" || !(u.Hostname() == "nse.co.ke" || strings.HasSuffix(u.Hostname(), ".nse.co.ke")) || record.Payload["change"] == nil {
			continue
		}
		_ = json.Unmarshal(record.Payload["actual"], &value)
		_ = json.Unmarshal(record.Payload["change"], &change)
		previous := value - change
		at, _ := time.Parse(time.RFC3339Nano, record.ObservedAt)
		if at.After(now.Add(24*time.Hour)) || value <= 0 || previous <= 0 {
			continue
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO market.indices(id,code,name,exchange,value,previous_close,change,change_percent,currency,event_timestamp,source)
 VALUES($1,$2,$3,'NSE',$4,$5,$6,$7,'KES',$8,'eod') ON CONFLICT(exchange,code) DO UPDATE SET value=EXCLUDED.value,previous_close=EXCLUDED.previous_close,change=EXCLUDED.change,change_percent=EXCLUDED.change_percent,event_timestamp=EXCLUDED.event_timestamp,source='eod' WHERE EXCLUDED.event_timestamp>=market.indices.event_timestamp`, "NSE:index:"+code, code, names[code], value, previous, change, change/previous*100, record.ObservedAt)
		if err != nil {
			return 0, err
		}
	}
	if err = tx.Commit(); err != nil {
		return 0, err
	}
	return len(records), nil
}
