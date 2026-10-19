package engine

import (
	"context"
	"encoding/json"
	"errors"
	"time"
)

func (n *NativeInputs) Statistics(ctx context.Context, exchange, symbol string) (json.RawMessage, error) {
	if n.Store == nil || n.Worker == nil {
		return nil, errors.New("native statistics inputs unavailable")
	}
	id, err := n.Store.SecurityID(ctx, exchange, symbol)
	if err != nil || id == nil {
		return nil, err
	}
	now := n.now()
	from := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC).Add(-366 * 24 * time.Hour)
	quote, err := n.quote(ctx, exchange, symbol)
	if err != nil {
		return nil, err
	}
	history, err := n.Store.FinancialHistory(ctx, *id, "annual", 10)
	if err != nil {
		return nil, err
	}
	candles, err := n.Store.Candles(ctx, *id, "1d", from, now)
	if err != nil {
		return nil, err
	}
	closes := []json.RawMessage{}
	if exchange == "NSE" {
		closes, err = n.Store.DailyCloseHistory(ctx, *id, from, now)
		if err != nil {
			return nil, err
		}
	}
	return n.Worker.Calculate(ctx, Request{Operation: "market_statistics", Args: []any{quote, history, candles, closes, now.Format(time.RFC3339Nano)}})
}
