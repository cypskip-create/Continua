package marketdata

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"
)

type QuoteInput struct {
	SecurityID    string   `json:"securityId"`
	Symbol        string   `json:"symbol"`
	Exchange      string   `json:"exchange"`
	LastPrice     *float64 `json:"lastPrice"`
	Open          *float64 `json:"open"`
	High          *float64 `json:"high"`
	Low           *float64 `json:"low"`
	PreviousClose *float64 `json:"previousClose"`
	Change        *float64 `json:"change"`
	ChangePercent *float64 `json:"changePercent"`
	Volume        *float64 `json:"volume"`
	Bid           *float64 `json:"bid"`
	Ask           *float64 `json:"ask"`
	MarketCap     *float64 `json:"marketCap"`
	Currency      string   `json:"currency"`
	Status        string   `json:"status"`
	Timestamp     string   `json:"timestamp"`
	Source        string   `json:"source"`
}

func (q QuoteInput) Validate(now time.Time) error {
	if q.Exchange != "NSE" || q.Currency != "KES" || q.SecurityID != "NSE:"+q.Symbol || q.Symbol == "" || len(q.Symbol) > 20 || q.Symbol != strings.ToUpper(strings.TrimSpace(q.Symbol)) {
		return errors.New("invalid quote identity")
	}
	if !map[string]bool{"active": true, "suspended": true, "halted": true, "delisted": true}[q.Status] || !map[string]bool{"live": true, "delayed": true, "eod": true}[q.Source] {
		return errors.New("invalid quote classification")
	}
	for _, v := range []*float64{q.LastPrice, q.Open, q.High, q.Low, q.PreviousClose, q.Volume} {
		if v == nil || math.IsNaN(*v) || math.IsInf(*v, 0) || *v < 0 {
			return errors.New("literal nonnegative quote observations required")
		}
	}
	for _, v := range []*float64{q.Change, q.ChangePercent} {
		if v == nil || math.IsNaN(*v) || math.IsInf(*v, 0) {
			return errors.New("quote movement unavailable")
		}
	}
	if *q.Volume != math.Trunc(*q.Volume) || *q.Volume > 9007199254740991 {
		return errors.New("literal integral share volume required")
	}
	for _, v := range []*float64{q.Bid, q.Ask, q.MarketCap} {
		if v != nil && (math.IsNaN(*v) || math.IsInf(*v, 0) || *v < 0) {
			return errors.New("invalid optional quote observation")
		}
	}
	if *q.High < *q.Low || (*q.High != 0 && (*q.High < *q.LastPrice*.5 || *q.LastPrice > *q.High*1.5)) {
		return errors.New("inconsistent quote range")
	}
	at, err := time.Parse(time.RFC3339Nano, q.Timestamp)
	if err != nil || at.After(now) {
		return errors.New("past dated quote required")
	}
	return nil
}

// A single bounded statement persists the batch. RETURNING contains only
// committed changes: duplicates/older ticks cannot manufacture stream events.
func (s *Store) UpsertQuotesBatch(ctx context.Context, quotes []QuoteInput, now time.Time) ([]json.RawMessage, error) {
	if len(quotes) > 500 {
		return nil, errors.New("quote batch limit")
	}
	if len(quotes) == 0 {
		return []json.RawMessage{}, nil
	}
	quotes = append([]QuoteInput(nil), quotes...)
	sort.Slice(quotes, func(i, j int) bool { return quotes[i].SecurityID < quotes[j].SecurityID })
	args := []any{}
	rows := []string{}
	seen := map[string]bool{}
	for _, q := range quotes {
		if err := q.Validate(now); err != nil {
			return nil, err
		}
		// The public quote/research contract uses JavaScript ISO milliseconds.
		// Persist that same precision so dated research freshness comparisons
		// cannot disagree with a hidden microsecond/nanosecond database value.
		at, _ := time.Parse(time.RFC3339Nano, q.Timestamp)
		q.Timestamp = at.UTC().Truncate(time.Millisecond).Format("2006-01-02T15:04:05.000Z")
		if seen[q.SecurityID] {
			return nil, errors.New("duplicate quote identity in batch")
		}
		seen[q.SecurityID] = true
		placeholders := []string{}
		for i := 1; i <= 18; i++ {
			placeholders = append(placeholders, fmt.Sprintf("$%d", len(args)+i))
		}
		rows = append(rows, "("+strings.Join(placeholders, ",")+")")
		args = append(args, q.SecurityID, q.Symbol, q.Exchange, q.LastPrice, q.Open, q.High, q.Low, q.PreviousClose, q.Change, q.ChangePercent, q.Volume, q.Bid, q.Ask, q.MarketCap, q.Currency, q.Status, q.Timestamp, q.Source)
	}
	// Identity/currency must also match the canonical security registry. Publisher
	// permission is checked by the collector service before this internal write.
	query := `WITH input(security_id,symbol,exchange,last_price,open,high,low,previous_close,change,change_percent,volume,bid,ask,market_cap,currency,status,event_timestamp,source) AS (VALUES ` + strings.Join(rows, ",") + `),
 saved AS (INSERT INTO market.live_quotes(security_id,symbol,exchange,last_price,open,high,low,previous_close,change,change_percent,volume,bid,ask,market_cap,currency,status,event_timestamp,source)
 SELECT i.security_id,i.symbol,i.exchange,i.last_price::numeric,i.open::numeric,i.high::numeric,i.low::numeric,i.previous_close::numeric,i.change::numeric,i.change_percent::numeric,i.volume::numeric,
 i.bid::numeric,i.ask::numeric,i.market_cap::numeric,i.currency,i.status,i.event_timestamp::timestamptz,i.source FROM input i
 JOIN market.securities s ON s.id=i.security_id AND s.symbol=i.symbol AND s.exchange=i.exchange AND s.currency=i.currency AND s.status<>'delisted'
 ON CONFLICT(security_id) DO UPDATE SET last_price=EXCLUDED.last_price,open=EXCLUDED.open,high=EXCLUDED.high,low=EXCLUDED.low,previous_close=EXCLUDED.previous_close,
 change=EXCLUDED.change,change_percent=EXCLUDED.change_percent,volume=EXCLUDED.volume,bid=EXCLUDED.bid,ask=EXCLUDED.ask,market_cap=EXCLUDED.market_cap,
 status=EXCLUDED.status,event_timestamp=EXCLUDED.event_timestamp,source=EXCLUDED.source,updated_at=now()
 WHERE EXCLUDED.event_timestamp>=market.live_quotes.event_timestamp AND EXCLUDED.currency=market.live_quotes.currency
 AND (EXCLUDED.last_price,EXCLUDED.open,EXCLUDED.high,EXCLUDED.low,EXCLUDED.previous_close,EXCLUDED.change,EXCLUDED.change_percent,EXCLUDED.volume,EXCLUDED.bid,EXCLUDED.ask,EXCLUDED.market_cap,EXCLUDED.status,EXCLUDED.event_timestamp,EXCLUDED.source)
 IS DISTINCT FROM (market.live_quotes.last_price,market.live_quotes.open,market.live_quotes.high,market.live_quotes.low,market.live_quotes.previous_close,market.live_quotes.change,market.live_quotes.change_percent,market.live_quotes.volume,market.live_quotes.bid,market.live_quotes.ask,market.live_quotes.market_cap,market.live_quotes.status,market.live_quotes.event_timestamp,market.live_quotes.source)
 RETURNING *)`
	if s.DurableQuoteRefresh {
		query += `, requested_refresh AS (INSERT INTO market.native_research_refresh(security_id,symbol) SELECT security_id,symbol FROM saved WHERE true ON CONFLICT(security_id) DO UPDATE SET symbol=EXCLUDED.symbol,requested_version=market.native_research_refresh.requested_version+1,requested_at=now(),next_attempt_at=LEAST(market.native_research_refresh.next_attempt_at,now()),attempts=0,last_error=NULL RETURNING security_id)`
	}
	query += ` SELECT row_to_json(result) FROM (SELECT ` + quoteColumns + ` FROM saved q ORDER BY q.symbol) result`
	return s.JSONRows(ctx, query, args...)
}
