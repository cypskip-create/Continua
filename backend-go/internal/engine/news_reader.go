package engine

import (
	"context"
	"continua/backend/internal/cache"
	"continua/backend/internal/marketdata"
	"encoding/json"
	"errors"
	"strconv"
	"time"
)

type NewsInputs interface {
	NewsDirectory(context.Context, string) ([]json.RawMessage, error)
	NewsCandidates(context.Context, *string, *string, int, int) ([]json.RawMessage, error)
	NewsArticle(context.Context, string) (json.RawMessage, error)
}
type NewsReader struct {
	Store   NewsInputs
	Worker  *Worker
	Cache   cache.Client
	Observe func(string, time.Duration, error)
}

func (n *NewsReader) observed(stage string, start time.Time, err error) {
	if n.Observe != nil {
		n.Observe(stage, time.Since(start), err)
	}
}

func (n *NewsReader) directory(ctx context.Context) (json.RawMessage, error) {
	return n.Cache.GetOrLoad(ctx, "news:issuer-directory:NSE", 5*time.Minute, func(ctx context.Context) (json.RawMessage, error) {
		rows, err := n.Store.NewsDirectory(ctx, "NSE")
		if err != nil {
			return nil, err
		}
		return json.Marshal(rows)
	})
}
func (n *NewsReader) List(ctx context.Context, securityID, category *string, limit int) ([]json.RawMessage, error) {
	if n.Store == nil || n.Worker == nil || n.Cache == nil || limit < 1 || limit > 100 {
		return nil, errors.New("invalid native news configuration")
	}
	// Public evidence only. Bound identical cold requests with shared cache
	// admission, and invalidate on committed bridge/revalidation changes.
	keyParts, _ := json.Marshal([]any{securityID, category, limit})
	raw, err := n.Cache.GetOrLoad(ctx, "news:list:v1:"+string(keyParts), 30*time.Second, func(ctx context.Context) (json.RawMessage, error) {
		rows, e := n.list(ctx, securityID, category, limit)
		if e != nil {
			return nil, e
		}
		return json.Marshal(rows)
	})
	if err != nil {
		return nil, err
	}
	var rows []json.RawMessage
	if json.Unmarshal(raw, &rows) != nil {
		return nil, errors.New("invalid cached news result")
	}
	return rows, nil
}

func (n *NewsReader) list(ctx context.Context, securityID, category *string, limit int) ([]json.RawMessage, error) {
	started := time.Now()
	directory, err := n.directory(ctx)
	n.observed("issuer-directory", started, err)
	if err != nil {
		return nil, err
	}
	candidateLimit := limit * 4
	if candidateLimit < 80 {
		candidateLimit = 80
	}
	if candidateLimit > 400 {
		candidateLimit = 400
	}
	if securityID != nil {
		candidateLimit = 800
	}
	result := []json.RawMessage{}
	err = n.Worker.WithEvidence(ctx, func(invoke EvidenceInvoke) error {
		mapRows := func(rows []json.RawMessage) error {
			start := time.Now()
			raw, e := invoke(Request{Operation: "map_news_rows", Args: []any{rows, directory, securityID}})
			n.observed("issuer-mapping", start, e)
			if e != nil {
				return e
			}
			var mapped []json.RawMessage
			if json.Unmarshal(raw, &mapped) != nil {
				return errors.New("invalid mapped news response")
			}
			result = append(result, mapped...)
			return nil
		}
		streamer, streaming := n.Store.(interface {
			StreamNewsCandidates(context.Context, *string, *string, int, func([]json.RawMessage) error) error
		})
		if streaming {
			start := time.Now()
			e := streamer.StreamNewsCandidates(ctx, securityID, category, candidateLimit, mapRows)
			n.observed("candidate-stream", start, e)
			if e != nil {
				return e
			}
		} else {
			// Preserve the original complete-candidate deduplication semantics: do not
			// stop early before a later, better verified receipt can replace a duplicate.
			for offset := 0; offset < candidateLimit; {
				// Bound bytes as well as rows. The reader retains its 16 MiB
				// ceiling and halves on overflow, without truncating source prose.
				// Fewer remote roundtrips preserve the full candidate scan deadline.
				batch := 128
				if remaining := candidateLimit - offset; remaining < batch {
					batch = remaining
				}
				var rows []json.RawMessage
				var e error
				for {
					started = time.Now()
					rows, e = n.Store.NewsCandidates(ctx, securityID, category, batch, offset)
					n.observed("candidate-read", started, e)
					if !errors.Is(e, marketdata.ErrReadBudget) || batch == 1 {
						break
					}
					batch = (batch + 1) / 2
				}
				if e != nil {
					return e
				}
				if len(rows) == 0 {
					break
				}
				if e = mapRows(rows); e != nil {
					return e
				}
				offset += len(rows)
				if len(rows) < batch {
					break
				}
			}
		}
		raw, e := invoke(Request{Operation: "dedupe_news", Args: []any{result}})
		if e != nil {
			return e
		}
		if json.Unmarshal(raw, &result) != nil {
			return errors.New("invalid news deduplication response")
		}
		if len(result) > limit {
			result = result[:limit]
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

func (n *NewsReader) Article(ctx context.Context, id string) (json.RawMessage, error) {
	if parsed, err := strconv.ParseInt(id, 10, 64); err != nil || parsed < 1 {
		return nil, errors.New("invalid news id")
	}
	directory, err := n.directory(ctx)
	if err != nil {
		return nil, err
	}
	raw, err := n.Store.NewsArticle(ctx, id)
	if err != nil || raw == nil {
		return nil, err
	}
	mapped, err := n.Worker.Calculate(ctx, Request{Operation: "map_news_rows", Args: []any{[]json.RawMessage{raw}, directory, nil}})
	if err != nil {
		return nil, err
	}
	var items []json.RawMessage
	if json.Unmarshal(mapped, &items) != nil {
		return nil, errors.New("invalid article evidence")
	}
	if len(items) == 0 {
		return nil, nil
	}
	return items[0], nil
}
