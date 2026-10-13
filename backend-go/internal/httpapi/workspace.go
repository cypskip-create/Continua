package httpapi

import (
	"context"
	"continua/backend/internal/auth"
	"continua/backend/internal/marketdata"
	"encoding/json"
	"errors"
	"io"
	"math"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf16"
)

type WorkspaceStore interface {
	MonitoringRules(context.Context, string) ([]json.RawMessage, error)
	SaveMonitoringRule(context.Context, string, marketdata.MonitorRule) (json.RawMessage, error)
	DeleteMonitoringRule(context.Context, string, string) error
	MonitoringActivity(context.Context, string) ([]json.RawMessage, error)
	AddCashFlow(context.Context, string, string, string, float64, string) (json.RawMessage, error)
	DeleteCashFlow(context.Context, string, string) error
}

var workspaceUUID = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
var monitorKinds = map[string]bool{"material_change": true, "price_below": true, "price_above": true, "debt_above": true, "revenue_growth_below": true, "earnings_growth_below": true, "cash_conversion_below": true, "dividend_payout_above": true, "quote_age_above": true}

func workspaceBody(r *http.Request) (map[string]json.RawMessage, error) {
	raw, err := io.ReadAll(io.LimitReader(r.Body, 65537))
	if err != nil || len(raw) > 65536 {
		return nil, errors.New("invalid body")
	}
	var body map[string]json.RawMessage
	if json.Unmarshal(raw, &body) != nil || body == nil {
		return nil, errors.New("invalid body")
	}
	return body, nil
}
func workspaceString(body map[string]json.RawMessage, key string, defaultValue *string) (string, error) {
	raw, exists := body[key]
	if !exists && defaultValue != nil {
		return *defaultValue, nil
	}
	var value string
	if !exists || string(raw) == "null" || json.Unmarshal(raw, &value) != nil {
		return "", errors.New("invalid field")
	}
	return value, nil
}
func (s *Server) workspace(ctx context.Context, w http.ResponseWriter, r *http.Request, id *auth.Identity) bool {
	path, method := r.URL.Path, r.Method
	rules := path == "/api/v1/engine/monitoring" && (method == "GET" || method == "POST")
	activity := path == "/api/v1/engine/monitoring/activity" && method == "GET"
	deleteRule := strings.HasPrefix(path, "/api/v1/engine/monitoring/") && method == "DELETE"
	flow := path == "/api/v1/engine/cash-flows" && method == "POST"
	deleteFlow := strings.HasPrefix(path, "/api/v1/engine/cash-flows/") && method == "DELETE"
	if !rules && !activity && !deleteRule && !flow && !deleteFlow {
		return false
	}
	if err := auth.RequirePlus(id); err != nil {
		failure(w, auth.AccessStatus(err), err.Error())
		return true
	}
	store, ok := s.Store.(WorkspaceStore)
	if !ok {
		failure(w, 503, "Native Engine workspace storage is not configured.")
		return true
	}
	var data any
	var err error
	if method == "GET" {
		if activity {
			data, err = store.MonitoringActivity(ctx, id.UserID)
		} else {
			data, err = store.MonitoringRules(ctx, id.UserID)
		}
	} else if method == "DELETE" {
		prefix := "/api/v1/engine/monitoring/"
		if deleteFlow {
			prefix = "/api/v1/engine/cash-flows/"
		}
		target := strings.TrimPrefix(path, prefix)
		if !workspaceUUID.MatchString(target) {
			failure(w, 400, "Invalid Engine record ID")
			return true
		}
		if deleteFlow {
			err = store.DeleteCashFlow(ctx, id.UserID, target)
		} else {
			err = store.DeleteMonitoringRule(ctx, id.UserID, target)
		}
		data = map[string]bool{"deleted": true}
	} else {
		body, e := workspaceBody(r)
		if e != nil {
			failure(w, 400, "Invalid Engine request")
			return true
		}
		nse := "NSE"
		exchange, e := workspaceString(body, "exchange", &nse)
		if e != nil || exchange != "NSE" {
			failure(w, 400, "Invalid exchange")
			return true
		}
		if flow {
			date, e := workspaceString(body, "date", nil)
			parsed, dateErr := time.Parse("2006-01-02", date)
			var amount float64
			rawAmount, exists := body["amount"]
			empty := ""
			note, noteErr := workspaceString(body, "note", &empty)
			if e != nil || dateErr != nil || parsed.Format("2006-01-02") != date || date > time.Now().UTC().Format("2006-01-02") || !exists || string(rawAmount) == "null" || json.Unmarshal(rawAmount, &amount) != nil || math.IsNaN(amount) || math.IsInf(amount, 0) || amount == 0 || math.Abs(amount) > 1e12 || noteErr != nil || len(utf16.Encode([]rune(note))) > 160 {
				failure(w, 400, "Invalid Engine cash flow")
				return true
			}
			data, err = store.AddCashFlow(ctx, id.UserID, exchange, date, amount, note)
		} else {
			symbol, e := workspaceString(body, "symbol", nil)
			symbol = strings.ToUpper(strings.TrimSpace(symbol))
			kind, kindErr := workspaceString(body, "kind", nil)
			rule := marketdata.MonitorRule{Exchange: exchange, Symbol: symbol, Kind: kind, Enabled: true}
			if raw, exists := body["enabled"]; exists {
				if string(raw) == "null" || json.Unmarshal(raw, &rule.Enabled) != nil {
					failure(w, 400, "Invalid Engine monitoring rule")
					return true
				}
			}
			if raw, exists := body["threshold"]; exists {
				var threshold float64
				if string(raw) == "null" || json.Unmarshal(raw, &threshold) != nil || math.Abs(threshold) > 1e9 {
					failure(w, 400, "Invalid Engine threshold")
					return true
				}
				rule.Threshold = &threshold
			}
			if e != nil || !interestSymbol.MatchString(symbol) || kindErr != nil || !monitorKinds[kind] || (kind != "material_change" && rule.Threshold == nil) {
				failure(w, 400, "Invalid Engine monitoring rule")
				return true
			}
			data, err = store.SaveMonitoringRule(ctx, id.UserID, rule)
		}
	}
	if errors.Is(err, marketdata.ErrMonitorCapacity) {
		failure(w, 400, err.Error())
		return true
	}
	if err != nil {
		failure(w, 503, "Engine workspace is temporarily unavailable. Please retry.")
		return true
	}
	respond(w, 200, map[string]any{"data": data})
	return true
}
