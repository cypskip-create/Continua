package ingestion

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
)

type MarketTransport struct {
	collector   *CollectorClient
	source, key string
}

var nativeSourceID = regexp.MustCompile(`^[A-Za-z0-9._-]{1,200}$`)

func NewMarketTransport(origin, source, key string, allowLoopback bool) (*MarketTransport, error) {
	if !nativeSourceID.MatchString(source) || len(key) < 32 || len(key) > 512 || strings.TrimSpace(key) != key {
		return nil, errors.New("native market transport configuration rejected")
	}
	collector, err := NewCollectorClient(origin, allowLoopback)
	if err != nil {
		return nil, err
	}
	return &MarketTransport{collector: collector, source: source, key: key}, nil
}

func (t *MarketTransport) read(ctx context.Context, operation string, args map[string]any) (json.RawMessage, error) {
	if t == nil || t.collector == nil {
		return nil, errors.New("native market transport missing")
	}
	packet := map[string]any{"sourceId": t.source, "operation": operation}
	for key, value := range args {
		packet[key] = value
	}
	body, err := json.Marshal(packet)
	if err != nil || len(body) > 65536 {
		return nil, errors.New("source request exceeds budget")
	}
	endpoint := *t.collector.base
	endpoint.Path = "/internal/nse/read"
	request, err := http.NewRequestWithContext(ctx, "POST", endpoint.String(), bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json")
	request.Header.Set("X-Collector-Market-Key", t.key)
	response, err := t.collector.client.Do(request)
	if err != nil {
		return nil, errors.New("native market source unavailable")
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, 2*1024*1024+1))
	if err != nil || len(raw) > 2*1024*1024 || response.StatusCode != 200 {
		return nil, errors.New("native market source response rejected")
	}
	var decoded struct {
		Implementation, Runtime string
		Data                    json.RawMessage
	}
	if json.Unmarshal(raw, &decoded) != nil || decoded.Implementation != "python" || decoded.Runtime != "python" || len(decoded.Data) == 0 || !json.Valid(decoded.Data) {
		return nil, errors.New("market source is not the native collector protocol")
	}
	return decoded.Data, nil
}

func (t *MarketTransport) records(ctx context.Context, operation string, args map[string]any) ([]json.RawMessage, error) {
	raw, err := t.read(ctx, operation, args)
	if err != nil {
		return nil, err
	}
	var rows []json.RawMessage
	if json.Unmarshal(raw, &rows) != nil || rows == nil || len(rows) > 10000 {
		return nil, errors.New("invalid native market source records")
	}
	return rows, nil
}
func (t *MarketTransport) Securities(ctx context.Context) ([]json.RawMessage, error) {
	return t.records(ctx, "securities", nil)
}

// RequestQuoteRefresh starts collector-owned bounded work, never waits for a
// whole exchange crawl or publishes unproven raw SDK fields as canonical data.
func (t *MarketTransport) RequestQuoteRefresh(ctx context.Context) error {
	raw, err := t.read(ctx, "refresh-quotes", nil)
	if err != nil {
		return err
	}
	var receipt struct {
		Accepted bool   `json:"accepted"`
		Reason   string `json:"reason"`
	}
	if json.Unmarshal(raw, &receipt) != nil || (!receipt.Accepted && receipt.Reason != "cooldown") {
		return errors.New("native quote collection is not available")
	}
	return nil
}
func (t *MarketTransport) Quotes(ctx context.Context, symbols []string) ([]json.RawMessage, error) {
	if len(symbols) > 1000 {
		return nil, errors.New("quote universe budget")
	}
	if len(symbols) == 0 {
		directory, err := t.Securities(ctx)
		if err != nil {
			return nil, err
		}
		for _, raw := range directory {
			var row struct{ Symbol string }
			if json.Unmarshal(raw, &row) != nil {
				return nil, errors.New("invalid source directory")
			}
			symbols = append(symbols, row.Symbol)
		}
	}
	all := []json.RawMessage{}
	for start := 0; start < len(symbols); start += 10 {
		rows, err := t.records(ctx, "quotes", map[string]any{"symbols": symbols[start:min(start+10, len(symbols))]})
		if err != nil {
			return nil, err
		}
		all = append(all, rows...)
	}
	return all, nil
}
func (t *MarketTransport) CompanyProfile(ctx context.Context, symbol string) (json.RawMessage, error) {
	return t.read(ctx, "profile", map[string]any{"symbol": symbol})
}
func (t *MarketTransport) Financials(ctx context.Context, symbol string) ([]json.RawMessage, error) {
	return t.records(ctx, "financials", map[string]any{"symbol": symbol})
}
func (t *MarketTransport) CorporateActions(ctx context.Context, since *string) ([]json.RawMessage, error) {
	return t.records(ctx, "actions", map[string]any{"since": since})
}
func (t *MarketTransport) EarningsEvents(ctx context.Context, since *string) ([]json.RawMessage, error) {
	return t.records(ctx, "earnings", map[string]any{"since": since})
}
func (t *MarketTransport) Ownership(ctx context.Context, symbol string) ([]json.RawMessage, error) {
	return t.records(ctx, "ownership", map[string]any{"symbol": symbol})
}
func (t *MarketTransport) Candles(ctx context.Context, symbol, interval string, from, to time.Time) ([]json.RawMessage, error) {
	return t.records(ctx, "candles", map[string]any{"symbol": symbol, "interval": interval, "from": from.UTC().Format(time.RFC3339Nano), "to": to.UTC().Format(time.RFC3339Nano)})
}
func (t *MarketTransport) Close() {
	if t != nil && t.collector != nil {
		t.collector.Close()
	}
}
