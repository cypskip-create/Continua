package httpapi

import (
	"context"
	"continua/backend/internal/auth"
	"continua/backend/internal/engine"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
)

type investmentStore interface {
	InvestmentEvidence(context.Context, string, string, string) ([]json.RawMessage, error)
}
type investmentEventScopeStore interface {
	InvestmentEventSymbols(context.Context, string, string) ([]string, error)
}
type investmentSimulationStore interface {
	InvestmentSimulations(context.Context, string) ([]json.RawMessage, error)
	SaveInvestmentSimulation(context.Context, string, string, string, string, json.RawMessage, json.RawMessage) (json.RawMessage, error)
	InvestmentSimulation(context.Context, string, string, bool) (json.RawMessage, error)
}
type investmentAuxStore interface {
	InvestmentCoverage(context.Context) ([]json.RawMessage, []json.RawMessage, error)
	InvestmentEventPreferences(context.Context, string, json.RawMessage) (json.RawMessage, error)
}

func (s *Server) investment(ctx context.Context, w http.ResponseWriter, r *http.Request, id *auth.Identity) bool {
	path := strings.TrimPrefix(r.URL.Path, "/api/v1/engine/investment/")
	if path == r.URL.Path {
		return false
	}
	w.Header().Set("Cache-Control", "no-store")
	if id == nil {
		failure(w, 401, "Sign in to use investment research")
		return true
	}
	if path == "evidence" {
		if r.Method != "GET" {
			failure(w, 405, "Method not allowed")
			return true
		}
		q := r.URL.Query()
		kind, cutoff, symbol := q.Get("kind"), q.Get("asOf"), q.Get("symbol")
		scope := q.Get("scope")
		if scope != "" && scope != "all" && scope != "held" && scope != "watched" {
			failure(w, 400, "Invalid event scope")
			return true
		}
		if scope == "held" || scope == "watched" {
			if kind != "event" || id.Plan != "premium_plus" {
				failure(w, 403, "Portfolio and watchlist event research requires Premium Plus")
				return true
			}
		}
		basic := id.Plan != "premium" && id.Plan != "premium_plus"
		date, e := time.Parse("2006-01-02", cutoff)
		if (kind != "macro" && kind != "event" && kind != "financial_extension") || e != nil || date.After(time.Now().UTC()) || (symbol != "" && !companySymbol.MatchString(symbol)) {
			failure(w, 400, "Invalid evidence filters")
			return true
		}
		if basic && cutoff != time.Now().UTC().Format("2006-01-02") {
			failure(w, 403, "Historical macro and event research requires Premium")
			return true
		}
		if kind == "financial_extension" && basic {
			failure(w, 403, "Detailed financial evidence requires Premium")
			return true
		}
		store, ok := s.Store.(investmentStore)
		if !ok {
			failure(w, 503, "Investment evidence storage unavailable")
			return true
		}
		rows, e := store.InvestmentEvidence(ctx, kind, cutoff, symbol)
		if e != nil {
			failure(w, 503, "Investment evidence requires the latest reviewed migration")
			return true
		}
		if rows == nil {
			rows = []json.RawMessage{}
		}
		if kind == "financial_extension" {
			respond(w, 200, map[string]any{"data": map[string]any{"observations": rows, "asOf": cutoff, "methodology": "Verified source-linked industry and segment observations. Missing fields are not inferred from sector membership."}})
			return true
		}
		if kind == "event" {
			if scope == "held" || scope == "watched" {
				scoped, ok := s.Store.(investmentEventScopeStore)
				if !ok {
					failure(w, 503, "Owned event scope unavailable")
					return true
				}
				symbols, e := scoped.InvestmentEventSymbols(ctx, id.UserID, scope)
				if e != nil {
					failure(w, 503, "Owned event scope unavailable")
					return true
				}
				allowed := map[string]bool{}
				for _, symbol := range symbols {
					allowed[symbol] = true
				}
				filtered := []json.RawMessage{}
				for _, raw := range rows {
					var event struct {
						Symbol string `json:"symbol"`
					}
					if json.Unmarshal(raw, &event) == nil && allowed[event.Symbol] {
						filtered = append(filtered, raw)
					}
				}
				rows = filtered
			}
			if basic {
				filtered := []json.RawMessage{}
				from := time.Now().UTC().AddDate(0, 0, -30).Format("2006-01-02")
				for _, raw := range rows {
					var event map[string]json.RawMessage
					if json.Unmarshal(raw, &event) != nil {
						continue
					}
					var observed, effective string
					_ = json.Unmarshal(event["date"], &observed)
					_ = json.Unmarshal(event["effectiveDate"], &effective)
					if observed < from && effective < cutoff {
						continue
					}
					public := map[string]json.RawMessage{}
					for _, key := range []string{"id", "date", "availableAt", "sourceUrl", "title", "type", "effectiveDate", "status"} {
						if value, ok := event[key]; ok {
							public[key] = value
						}
					}
					encoded, _ := json.Marshal(public)
					filtered = append(filtered, encoded)
				}
				rows = filtered
			}
			respond(w, 200, map[string]any{"data": map[string]any{"events": rows, "asOf": cutoff, "methodology": "Verified source-backed revisions available at cutoff. Empty coverage does not establish absence of events."}})
			return true
		}
		s.investmentCalculation(ctx, w, id.UserID, map[string]any{"kind": "macro", "asOf": cutoff, "observations": rows, "basic": basic})
		return true
	}
	if err := auth.RequirePlus(id); err != nil {
		failure(w, auth.AccessStatus(err), err.Error())
		return true
	}
	if path == "coverage" || path == "event-preferences" {
		store, ok := s.Store.(investmentAuxStore)
		if !ok {
			failure(w, 503, "Investment evidence storage unavailable")
			return true
		}
		if path == "coverage" {
			if r.Method != "GET" {
				failure(w, 405, "Method not allowed")
				return true
			}
			securities, sources, e := store.InvestmentCoverage(ctx)
			if e != nil {
				failure(w, 503, "Coverage requires latest reviewed migration")
				return true
			}
			respond(w, 200, map[string]any{"data": map[string]any{"securities": securities, "sources": sources, "checkedAt": time.Now().UTC().Format(time.RFC3339), "methodology": "All registered NSE securities, including suspended/delisted. Stored coverage is not proof of complete actions or a historical universe; unknown listing dates do not produce invented fiscal-year gaps."}})
			return true
		}
		var settings json.RawMessage
		if r.Method == "POST" {
			raw, e := io.ReadAll(http.MaxBytesReader(w, r.Body, 4096))
			var values map[string]*bool
			if e != nil || json.Unmarshal(raw, &values) != nil || len(values) != 4 {
				failure(w, 400, "Four explicit event preference booleans required")
				return true
			}
			for _, key := range []string{"enabled", "held", "watched", "macro"} {
				if value, ok := values[key]; !ok || value == nil {
					failure(w, 400, "Invalid event preference keys")
					return true
				}
			}
			settings = raw
		} else if r.Method != "GET" {
			failure(w, 405, "Method not allowed")
			return true
		}
		result, e := store.InvestmentEventPreferences(ctx, id.UserID, settings)
		if e != nil {
			failure(w, 503, "Event preferences unavailable")
			return true
		}
		respond(w, 200, map[string]any{"data": result})
		return true
	}
	if strings.HasPrefix(path, "simulations/") {
		store, ok := s.Store.(investmentSimulationStore)
		if !ok {
			failure(w, 503, "Simulation storage unavailable")
			return true
		}
		key := strings.TrimPrefix(path, "simulations/")
		if !regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`).MatchString(key) {
			failure(w, 400, "Invalid simulation identifier")
			return true
		}
		if r.Method != "GET" && r.Method != "DELETE" {
			failure(w, 405, "Method not allowed")
			return true
		}
		result, e := store.InvestmentSimulation(ctx, id.UserID, key, r.Method == "DELETE")
		if e != nil {
			failure(w, 503, "Simulation unavailable")
			return true
		}
		if len(result) == 0 {
			failure(w, 404, "Simulation not found")
			return true
		}
		respond(w, 200, map[string]any{"data": result})
		return true
	}
	if path == "simulations" {
		store, ok := s.Store.(investmentSimulationStore)
		if !ok {
			failure(w, 503, "Private simulation storage unavailable")
			return true
		}
		if r.Method == "GET" {
			rows, e := store.InvestmentSimulations(ctx, id.UserID)
			if e != nil {
				failure(w, 503, "Private simulations unavailable")
				return true
			}
			if rows == nil {
				rows = []json.RawMessage{}
			}
			respond(w, 200, map[string]any{"data": rows})
			return true
		}
		if r.Method != "POST" {
			failure(w, 405, "Method not allowed")
			return true
		}
		raw, e := io.ReadAll(http.MaxBytesReader(w, r.Body, 2097152))
		if e != nil {
			failure(w, 413, "Simulation exceeds limit")
			return true
		}
		var input struct {
			Name          string          `json:"name"`
			Configuration json.RawMessage `json:"configuration"`
		}
		if json.Unmarshal(raw, &input) != nil || len(strings.TrimSpace(input.Name)) < 1 || len(input.Name) > 100 {
			failure(w, 400, "A simulation name and configuration are required")
			return true
		}
		var config struct {
			Kind string `json:"kind"`
		}
		if json.Unmarshal(input.Configuration, &config) != nil || (config.Kind != "optimization" && config.Kind != "backtest") {
			failure(w, 400, "Select optimization or backtest")
			return true
		}
		if s.Engine == nil {
			failure(w, 503, "Numerical worker unavailable")
			return true
		}
		output, e := s.Engine.Calculate(ctx, engine.Request{Operation: "investment_research", Args: []any{input.Configuration}})
		var envelope struct {
			Status int             `json:"status"`
			Data   json.RawMessage `json:"data"`
			Error  string          `json:"error"`
		}
		if e != nil || json.Unmarshal(output, &envelope) != nil {
			failure(w, 503, "Simulation calculation unavailable")
			return true
		}
		if envelope.Status != 200 {
			failure(w, 422, envelope.Error)
			return true
		}
		var result struct {
			SnapshotID string `json:"snapshotId"`
		}
		if json.Unmarshal(envelope.Data, &result) != nil || len(result.SnapshotID) != 64 {
			failure(w, 503, "Simulation fingerprint unavailable")
			return true
		}
		saved, e := store.SaveInvestmentSimulation(ctx, id.UserID, strings.TrimSpace(input.Name), config.Kind, result.SnapshotID, input.Configuration, envelope.Data)
		if e != nil {
			failure(w, 503, "Simulation could not be saved")
			return true
		}
		if string(saved) == "null" {
			failure(w, 422, "Simulation storage limit reached (25 per account), or snapshot too large. Export or remove an old simulation.")
			return true
		}
		respond(w, 201, map[string]any{"data": saved})
		return true
	}
	if path != "calculate" && path != "optimize-owned" {
		failure(w, 404, "Unknown investment research endpoint")
		return true
	}
	if r.Method != "POST" {
		failure(w, 405, "Method not allowed")
		return true
	}
	raw, e := io.ReadAll(http.MaxBytesReader(w, r.Body, 2097152))
	if e != nil {
		failure(w, 413, "Investment inputs exceed limit")
		return true
	}
	var input map[string]json.RawMessage
	if json.Unmarshal(raw, &input) != nil {
		failure(w, 400, "Invalid investment research JSON")
		return true
	}
	if path == "calculate" {
		var kind string
		_ = json.Unmarshal(input["kind"], &kind)
		allowed := map[string]bool{"macro": true, "factors": true, "factor-model": true, "macro-scenario": true, "event-impact": true, "financial-extension": true, "optimization": true, "backtest": true}
		if !allowed[kind] {
			failure(w, 400, "Unsupported investment module")
			return true
		}
	}
	if path == "optimize-owned" {
		if s.PortfolioResearch == nil {
			failure(w, 503, "Owned portfolio evidence unavailable")
			return true
		}
		owned, e := s.PortfolioResearch.Research(ctx, id.UserID, "NSE")
		var portfolio struct {
			Risk struct {
				Symbols    []string    `json:"symbols"`
				Weights    []float64   `json:"weights"`
				Covariance [][]float64 `json:"covariance"`
				Coverage   []struct {
					Included bool `json:"included"`
				} `json:"coverage"`
				Evidence struct {
					Observations int `json:"observations"`
				} `json:"evidence"`
				Overview struct {
					CoveredValue     float64 `json:"coveredValue"`
					RiskCoveredValue float64 `json:"riskCoveredValue"`
					Positions        []struct {
						Symbol string `json:"symbol"`
						Sector string `json:"sector"`
					} `json:"positions"`
				} `json:"overview"`
			} `json:"riskIntelligence"`
		}
		if e != nil || json.Unmarshal(owned, &portfolio) != nil {
			failure(w, 503, "Owned risk evidence unavailable")
			return true
		}
		risk := portfolio.Risk
		if len(risk.Covariance) == 0 || risk.Overview.CoveredValue != risk.Overview.RiskCoveredValue {
			failure(w, 422, "Every holding requires eligible aligned history")
			return true
		}
		for _, c := range risk.Coverage {
			if !c.Included {
				failure(w, 422, "Every holding requires eligible aligned history")
				return true
			}
		}
		options := map[string]any{}
		for key, value := range input {
			switch key {
			case "objective", "turnoverCap", "cashMaximum", "minimum", "maximum", "excluded", "sectorLimits":
				options[key] = value
			default:
				failure(w, 400, "Unknown optimization option")
				return true
			}
		}
		sectors := map[string]string{}
		for _, position := range risk.Overview.Positions {
			sectors[position.Symbol] = position.Sector
		}
		options["kind"] = "optimization"
		options["symbols"] = risk.Symbols
		options["currentWeights"] = risk.Weights
		options["covariance"] = risk.Covariance
		options["observations"] = risk.Evidence.Observations
		options["sectors"] = sectors
		s.investmentCalculation(ctx, w, id.UserID, options)
		return true
	}
	s.investmentCalculation(ctx, w, id.UserID, json.RawMessage(raw))
	return true
}

func (s *Server) investmentCalculation(ctx context.Context, w http.ResponseWriter, owner string, input any) {
	rawConfig, _ := json.Marshal(input)
	var model struct {
		Kind string `json:"kind"`
	}
	_ = json.Unmarshal(rawConfig, &model)
	monitored := model.Kind == "optimization" || model.Kind == "backtest" || model.Kind == "factor-model"
	state := "worker-unavailable"
	inputDigest := sha256.Sum256(rawConfig)
	hash := hex.EncodeToString(inputDigest[:])
	began := time.Now()
	summary := json.RawMessage(`{"validationStatus":"legacy numerical and evidence guards; not empirical accuracy"}`)
	if store, ok := s.Store.(institutionalStore); ok && monitored {
		rows, e := store.InstitutionalRead(ctx, "legacy-model", "", model.Kind)
		if e == nil && len(rows) > 0 {
			var active struct {
				Status string `json:"status"`
			}
			_ = json.Unmarshal(rows[0], &active)
			if active.Status == "disabled" {
				failure(w, 503, "Model disabled pending review")
				return
			}
		}
		defer func() {
			_ = store.InstitutionalRecord(ctx, owner, model.Kind, "investment-intelligence-v1", hash, state, summary, time.Since(began).Milliseconds())
		}()
	}

	if s.Engine == nil {
		failure(w, 503, "Numerical worker unavailable")
		return
	}
	output, err := s.Engine.Calculate(ctx, engine.Request{Operation: "investment_research", Args: []any{input}})
	if err != nil {
		failure(w, 503, "Investment calculation unavailable")
		return
	}
	var envelope struct {
		Status int             `json:"status"`
		Data   json.RawMessage `json:"data"`
		Error  string          `json:"error"`
	}
	if json.Unmarshal(output, &envelope) != nil {
		failure(w, 503, "Invalid investment calculation")
		return
	}
	state = "input-validation"
	if envelope.Status != 200 {
		failure(w, 422, envelope.Error)
		return
	}
	state = "success"
	var fingerprint struct {
		SnapshotID string `json:"snapshotId"`
	}
	if json.Unmarshal(envelope.Data, &fingerprint) == nil && len(fingerprint.SnapshotID) == 64 {
		hash = fingerprint.SnapshotID
	}
	if configuration, ok := input.(map[string]any); ok && configuration["kind"] == "optimization" {
		var data map[string]any
		if json.Unmarshal(envelope.Data, &data) != nil {
			failure(w, 503, "Invalid investment result")
			return
		}
		data["configuration"] = configuration
		respond(w, 200, map[string]any{"data": data})
		return
	}
	respond(w, 200, map[string]any{"data": envelope.Data})
}
