package ingestion

import (
	"context"
	"continua/backend/internal/engine"
	"continua/backend/internal/marketdata"
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"
)

type NewsStore interface {
	PendingNewsExtractions(context.Context, int) ([]int64, error)
	NewsExtraction(context.Context, int64) (json.RawMessage, error)
	NewsDirectory(context.Context, string) ([]json.RawMessage, error)
	UpsertNews(context.Context, marketdata.NewsInput) error
	RecordNewsFailure(context.Context, int64) error
	RecordNewsRun(context.Context, time.Time, int, int) error
}
type Calculator interface {
	Calculate(context.Context, engine.Request) (json.RawMessage, error)
}
type NewsBridge struct {
	Store  NewsStore
	Worker Calculator
}
type NewsSummary struct{ Processed, WithMentions, WithoutMentions, Failed int }

func (s *NewsBridge) Run(ctx context.Context, exchange string, batch int) (*NewsSummary, error) {
	if exchange != "NSE" || s.Store == nil || s.Worker == nil || batch < 1 || batch > 100 {
		return nil, errors.New("invalid native news bridge")
	}
	started := time.Now().UTC()
	ids, err := s.Store.PendingNewsExtractions(ctx, batch)
	if err != nil {
		return nil, err
	}
	directory, err := s.Store.NewsDirectory(ctx, exchange)
	if err != nil {
		return nil, err
	}
	// An unavailable universe is not proof that every article lacks issuers.
	if len(directory) == 0 {
		return nil, errors.New("news issuer directory unavailable")
	}
	summary := &NewsSummary{}
	for _, id := range ids {
		if err := ctx.Err(); err != nil {
			return summary, err
		}
		summary.Processed++
		raw, err := s.Store.NewsExtraction(ctx, id)
		if err == nil && raw != nil {
			var source struct {
				Source string `json:"sourceId"`
				URL    string `json:"documentUrl"`
			}
			if json.Unmarshal(raw, &source) != nil {
				err = errors.New("invalid source receipt")
			} else {
				value := strings.ToLower(source.Source + " " + source.URL)
				if source.Source == "test-rss" || source.Source == "real-rss" || strings.Contains(value, "hacker-news") || strings.Contains(value, "news.ycombinator.com") || strings.Contains(value, "hnrss.org") {
					continue
				}
				var calculated json.RawMessage
				calculated, err = s.Worker.Calculate(ctx, engine.Request{Operation: "news_ingestion_input", Args: []any{raw, directory}})
				if err == nil {
					var input marketdata.NewsInput
					if json.Unmarshal(calculated, &input) != nil || input.ExtractionID != id {
						err = errors.New("invalid news publication response")
					} else {
						err = s.Store.UpsertNews(ctx, input)
						if err == nil {
							if len(input.SecurityIDs) > 0 {
								summary.WithMentions++
							} else {
								summary.WithoutMentions++
							}
						}
					}
				}
			}
		}
		if err != nil {
			summary.Failed++
			if err := s.Store.RecordNewsFailure(ctx, id); err != nil {
				return summary, err
			}
		}
	}
	if err := s.Store.RecordNewsRun(ctx, started, summary.Processed, summary.Failed); err != nil {
		return summary, err
	}
	return summary, nil
}

// Revalidation pages are file/body bounded. Cursor advances only after the
// associated writes succeed; a changed receipt is left for the next full pass.
type RepairStore interface {
	NewsDirectory(context.Context, string) ([]json.RawMessage, error)
	NewsRevalidationRows(context.Context, string, int) ([]json.RawMessage, error)
	RepairNewsLinks(context.Context, string, *int64, string, []string) (bool, error)
}
type Revalidation struct {
	LastID               string
	Processed, Corrected int
}

func RevalidateNews(ctx context.Context, store RepairStore, worker Calculator, after string, limit int) (*Revalidation, error) {
	cursor, err := strconv.ParseInt(after, 10, 64)
	if err != nil || cursor < 0 || limit < 1 || limit > 100 || worker == nil {
		return nil, errors.New("invalid native news cursor")
	}
	directory, err := store.NewsDirectory(ctx, "NSE")
	if err != nil {
		return nil, err
	}
	if len(directory) == 0 {
		return nil, errors.New("news issuer directory unavailable")
	}
	result := &Revalidation{LastID: after}
	for result.Processed < limit {
		page := limit - result.Processed
		if page > 16 {
			page = 16
		}
		var rows []json.RawMessage
		var err error
		for {
			rows, err = store.NewsRevalidationRows(ctx, result.LastID, page)
			if !errors.Is(err, marketdata.ErrReadBudget) || page == 1 {
				break
			}
			page = (page + 1) / 2
		}
		if err != nil {
			return nil, err
		}
		if len(rows) == 0 {
			break
		}
		for _, raw := range rows {
			var row struct {
				ID           string   `json:"id"`
				Headline     string   `json:"headline"`
				MatchingText *string  `json:"matchingText"`
				Excerpt      *string  `json:"excerpt"`
				ExtractionID *int64   `json:"scrapedExtractionId"`
				SecurityIDs  []string `json:"securityIds"`
			}
			if json.Unmarshal(raw, &row) != nil {
				return nil, errors.New("invalid historical news receipt")
			}
			id, err := strconv.ParseInt(row.ID, 10, 64)
			if err != nil || id <= cursor {
				return nil, errors.New("nonmonotonic historical news cursor")
			}
			text := ""
			if row.MatchingText != nil {
				text = *row.MatchingText
			} else if row.Excerpt != nil {
				text = *row.Excerpt
			}
			// Full prose is processed by the large evidence profile, not silently cut.
			calculated, err := worker.Calculate(ctx, engine.Request{Operation: "news_revalidation", Args: []any{row.Headline, text, directory}})
			if err != nil {
				return nil, err
			}
			var verified []string
			if json.Unmarshal(calculated, &verified) != nil {
				return nil, errors.New("invalid repaired news evidence")
			}
			if !sameIDs(verified, row.SecurityIDs) {
				corrected, err := store.RepairNewsLinks(ctx, row.ID, row.ExtractionID, row.Headline, verified)
				if err != nil {
					return nil, err
				}
				if corrected {
					result.Corrected++
				}
			}
			cursor = id
			result.LastID = row.ID
			result.Processed++
		}
		if len(rows) < page {
			break
		}
	}
	return result, nil
}
func sameIDs(left, right []string) bool {
	a, b := map[string]bool{}, map[string]bool{}
	for _, id := range left {
		a[id] = true
	}
	for _, id := range right {
		b[id] = true
	}
	if len(a) != len(b) {
		return false
	}
	for id := range a {
		if !b[id] {
			return false
		}
	}
	return true
}
