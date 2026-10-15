package httpapi

import (
	"context"
	"continua/backend/internal/engine"
	"continua/backend/internal/marketdata"
	"continua/backend/internal/publication"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf16"
)

type AdminStore interface {
	PendingCandidates(context.Context, int) ([]json.RawMessage, error)
	Candidate(context.Context, string) (json.RawMessage, error)
	RejectCandidate(context.Context, string, *string) error
	AdminSecurities(context.Context, string) ([]json.RawMessage, error)
}
type FilingPublisher interface {
	Confirm(context.Context, string, json.RawMessage) (*publication.Result, error)
}
type AdminService struct {
	Key        string
	Store      AdminStore
	Worker     Calculator
	Publisher  FilingPublisher
	RequestJob func(string) bool
}

func (s *Server) admin(ctx context.Context, w http.ResponseWriter, r *http.Request) bool {
	const prefix = "/api/v1/admin/"
	if !strings.HasPrefix(r.URL.Path, prefix) {
		return false
	}
	a := s.Admin
	if a == nil || len(strings.TrimSpace(a.Key)) < 32 {
		failure(w, 503, "Admin access is not configured.")
		return true
	}
	supplied := strings.TrimSpace(r.Header.Get("X-Admin-Key"))
	if supplied == "" && strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ") {
		supplied = strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
	}
	actual, expected := sha256.Sum256([]byte(supplied)), sha256.Sum256([]byte(strings.TrimSpace(a.Key)))
	if supplied == "" || len(supplied) > 4096 || subtle.ConstantTimeCompare(actual[:], expected[:]) != 1 {
		failure(w, 401, "Invalid admin key")
		return true
	}
	if a.Store == nil {
		failure(w, 503, "Admin storage unavailable")
		return true
	}
	path := strings.TrimPrefix(r.URL.Path, prefix)
	if path == "financials/repair-condensed" {
		if r.Method != "POST" {
			failure(w, 405, "Method not allowed")
			return true
		}
		publisher, ok := a.Publisher.(interface {
			RepairCondensed(context.Context, int64, bool) (map[string]any, error)
		})
		if !ok {
			failure(w, 503, "Reviewed repair unavailable")
			return true
		}
		var body struct {
			ExtractionID int64 `json:"extractionId"`
			Apply        bool  `json:"apply"`
		}
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
		decoder.DisallowUnknownFields()
		if decoder.Decode(&body) != nil || decoder.Decode(new(any)) != io.EOF || body.ExtractionID < 1 {
			failure(w, 400, "Explicit reviewed extraction required")
			return true
		}
		result, err := publisher.RepairCondensed(ctx, body.ExtractionID, body.Apply)
		if err != nil {
			adminError(w, err)
		} else {
			respond(w, 200, map[string]any{"data": result})
		}
		return true
	}
	if path == "financials/reviewed-transcription" {
		if r.Method != "POST" {
			failure(w, 405, "Method not allowed")
			return true
		}
		publisher, ok := a.Publisher.(interface {
			ReviewedFiling(context.Context, json.RawMessage, bool) (*publication.ReviewedResult, error)
		})
		if !ok {
			failure(w, 503, "Reviewed transcription unavailable")
			return true
		}
		query := r.URL.Query()
		if len(query) > 1 || len(query["apply"]) > 1 || (r.URL.RawQuery != "" && (!query.Has("apply") || (query.Get("apply") != "true" && query.Get("apply") != "false"))) {
			failure(w, 400, "Invalid review mode")
			return true
		}
		raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1048576))
		if err != nil {
			failure(w, 413, "Review request too large")
			return true
		}
		result, err := publisher.ReviewedFiling(ctx, raw, r.URL.Query().Get("apply") == "true")
		if err != nil {
			adminError(w, err)
		} else {
			respond(w, 200, map[string]any{"data": result})
		}
		return true
	}
	if strings.HasPrefix(path, "jobs/") {
		if r.Method != "POST" {
			failure(w, 405, "Method not allowed")
			return true
		}
		name := strings.TrimPrefix(path, "jobs/")
		if !map[string]bool{"source-price-request": true, "source-listing-bootstrap": true, "source-candle-backfill": true, "document-publication": true, "financial-candidates": true, "news-bridge": true, "announcements": true, "daily-close-publication": true, "quote-publication": true, "index-publication": true, "collect-news": true, "collect-documents": true, "collect-indices": true, "research-refresh": true}[name] {
			failure(w, 404, "Unknown native job")
			return true
		}
		if a.RequestJob == nil {
			failure(w, 503, "Native jobs are not configured")
			return true
		}
		if !a.RequestJob(name) {
			respond(w, 409, map[string]any{"error": "Job unavailable, pending, or cooling down"})
			return true
		}
		respond(w, 202, map[string]any{"data": map[string]any{"job": name, "status": "accepted"}})
		return true
	}
	if r.Method == "GET" && path == "runtime" {
		if s.RuntimeSnapshot == nil {
			failure(w, 503, "Runtime measurements unavailable")
		} else {
			respond(w, 200, map[string]any{"data": s.RuntimeSnapshot()})
		}
		return true
	}
	if r.Method == "GET" && path == "securities" {
		exchange := r.URL.Query().Get("exchange")
		if exchange == "" {
			exchange = "NSE"
		}
		if exchange != "NSE" || len(r.URL.Query()["exchange"]) > 1 {
			failure(w, 400, "Invalid exchange")
			return true
		}
		rows, err := a.Store.AdminSecurities(ctx, exchange)
		adminRows(w, rows, err)
		return true
	}
	if r.Method == "GET" && path == "financials/candidates" {
		limit := 100
		var err error
		if r.URL.Query().Has("limit") {
			limit, err = strconv.Atoi(r.URL.Query().Get("limit"))
		}
		if err != nil || limit < 1 || limit > 100 || len(r.URL.Query()["limit"]) > 1 {
			failure(w, 400, "Invalid review limit")
			return true
		}
		rows, err := a.Store.PendingCandidates(ctx, limit)
		adminRows(w, rows, err)
		return true
	}
	parts := strings.Split(path, "/")
	if len(parts) < 3 || len(parts) > 4 || parts[0] != "financials" || parts[1] != "candidates" {
		failure(w, 404, "Not found")
		return true
	}
	id, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil || id < 1 {
		failure(w, 400, "Invalid candidate ID")
		return true
	}
	candidateID := strconv.FormatInt(id, 10)
	if r.Method == "GET" && len(parts) == 3 {
		raw, err := a.Store.Candidate(ctx, candidateID)
		if err != nil {
			adminError(w, err)
			return true
		}
		if raw == nil {
			failure(w, 404, "Filing candidate not found")
			return true
		}
		if a.Worker == nil {
			failure(w, 503, "Filing draft unavailable")
			return true
		}
		draft, err := a.Worker.Calculate(ctx, engine.Request{Operation: "filing_draft", Args: []any{raw}})
		if err != nil {
			adminError(w, err)
			return true
		}
		respond(w, 200, map[string]any{"data": raw, "draft": draft})
		return true
	}
	if r.Method != "POST" || len(parts) != 4 {
		failure(w, 404, "Not found")
		return true
	}
	action := parts[3]
	if action != "reject" && action != "confirm" && action != "confirm-history" {
		failure(w, 404, "Not found")
		return true
	}
	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1048576))
	if err != nil {
		failure(w, 413, "Review request too large")
		return true
	}
	if len(raw) == 0 && action == "reject" {
		raw = []byte(`{}`)
	}
	if !json.Valid(raw) {
		failure(w, 400, "Invalid review JSON")
		return true
	}
	if action == "reject" {
		var body struct {
			Note *string `json:"note"`
		}
		if json.Unmarshal(raw, &body) != nil || string(raw) == "null" || (body.Note != nil && len(utf16.Encode([]rune(*body.Note))) > 2000) {
			failure(w, 400, "Invalid review note")
			return true
		}
		if err := a.Store.RejectCandidate(ctx, candidateID, body.Note); err != nil {
			adminError(w, err)
			return true
		}
		respond(w, 200, map[string]any{"data": map[string]string{"candidateId": candidateID, "status": "rejected"}})
		return true
	}
	if a.Publisher == nil {
		failure(w, 503, "Reviewed publication unavailable")
		return true
	}
	if action == "confirm" {
		// Single-column review requires explicit units, page and column evidence.
		// Do not fabricate these from a draft to emulate the old unsafe write path.
		var body map[string]json.RawMessage
		if json.Unmarshal(raw, &body) != nil || body == nil {
			failure(w, 400, "Invalid review JSON")
			return true
		}
		entry := map[string]json.RawMessage{}
		for _, key := range []string{"columnIndex", "period", "income", "balance", "cashflow", "sourcePage", "note", "allowRestatement"} {
			if v, ok := body[key]; ok {
				entry[key] = v
			}
		}
		normalized := map[string]any{"statementType": body["statementType"], "unitsVerified": body["unitsVerified"], "periods": []any{entry}}
		if v, ok := body["securityId"]; ok {
			normalized["securityId"] = v
		}
		raw, err = json.Marshal(normalized)
		if err != nil {
			failure(w, 400, "Invalid review JSON")
			return true
		}
	}
	result, err := a.Publisher.Confirm(ctx, candidateID, raw)
	if err != nil {
		adminError(w, err)
		return true
	}
	if action == "confirm" {
		if result == nil || len(result.PeriodIDs) != 1 {
			failure(w, 503, "Invalid publication receipt")
			return true
		}
		var input publication.Confirmation
		_ = json.Unmarshal(raw, &input)
		security := input.SecurityID
		if security == nil {
			candidate, e := a.Store.Candidate(ctx, candidateID)
			if e == nil {
				var row struct {
					ID *string `json:"securityId"`
				}
				_ = json.Unmarshal(candidate, &row)
				security = row.ID
			}
		}
		respond(w, 200, map[string]any{"data": map[string]any{"candidateId": candidateID, "periodId": result.PeriodIDs[0], "securityId": security, "warning": nil}})
	} else {
		respond(w, 200, map[string]any{"data": result})
	}
	return true
}
func adminRows(w http.ResponseWriter, rows []json.RawMessage, err error) {
	if err != nil {
		adminError(w, err)
		return
	}
	if rows == nil {
		rows = []json.RawMessage{}
	}
	respond(w, 200, map[string]any{"data": rows})
}
func adminError(w http.ResponseWriter, err error) {
	var typed *publication.Error
	switch {
	case errors.As(err, &typed):
		failure(w, typed.Status, typed.Message)
	case errors.Is(err, sql.ErrNoRows):
		failure(w, 404, "Filing candidate not found")
	case errors.Is(err, marketdata.ErrCandidateReviewed):
		failure(w, 409, "Filing candidate already reviewed")
	default:
		failure(w, 503, "Filing review unavailable. Retry without changing the evidence.")
	}
}
