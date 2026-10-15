package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
)

type NewsProvider interface {
	List(context.Context, *string, *string, int) ([]json.RawMessage, error)
	Article(context.Context, string) (json.RawMessage, error)
}

func (s *Server) newsReads(ctx context.Context, w http.ResponseWriter, r *http.Request, exchange string) bool {
	path := r.URL.Path
	if path != "/api/v1/news" && !strings.HasPrefix(path, "/api/v1/news/") {
		return false
	}
	if s.News == nil {
		failure(w, 503, "Native news research is not configured.")
		return true
	}
	if strings.HasPrefix(path, "/api/v1/news/item/") {
		id := strings.TrimPrefix(path, "/api/v1/news/item/")
		value, err := strconv.ParseInt(id, 10, 64)
		if err != nil || value < 1 {
			failure(w, 404, "News item not found")
			return true
		}
		raw, err := s.News.Article(ctx, id)
		if err != nil {
			failure(w, 503, "News could not load. Please retry.")
		} else if len(raw) == 0 || string(raw) == "null" {
			failure(w, 404, "News item not found")
		} else {
			respond(w, 200, map[string]any{"data": raw})
		}
		return true
	}
	q := r.URL.Query()
	limit, err := intQuery(q, "limit", 50, 1, 100)
	if err != nil {
		failure(w, 400, "Invalid news limit")
		return true
	}
	var category, security *string
	if path == "/api/v1/news" {
		if q.Has("category") {
			value := q.Get("category")
			if len(q["category"]) != 1 || !map[string]bool{"markets": true, "earnings": true, "companies": true, "economy": true, "top": true}[value] {
				failure(w, 400, "Invalid news category")
				return true
			}
			category = &value
		}
		if s.RequestNews != nil {
			s.RequestNews()
		}
	} else {
		symbol := strings.TrimPrefix(path, "/api/v1/news/")
		if symbol == "" || strings.Contains(symbol, "/") {
			failure(w, 404, "Not found")
			return true
		}
		store, ok := s.Store.(interface {
			SecurityID(context.Context, string, string) (*string, error)
		})
		if !ok {
			failure(w, 503, "Native news issuer storage unavailable")
			return true
		}
		security, err = store.SecurityID(ctx, exchange, strings.ToUpper(symbol))
		if err != nil {
			failure(w, 503, "News could not load. Please retry.")
			return true
		}
		if security == nil {
			failure(w, 404, "Unknown symbol "+symbol)
			return true
		}
	}
	rows, err := s.News.List(ctx, security, category, limit)
	if err != nil {
		failure(w, 503, "News could not load. Please retry.")
		return true
	}
	if rows == nil {
		rows = []json.RawMessage{}
	}
	respond(w, 200, map[string]any{"data": rows})
	return true
}
