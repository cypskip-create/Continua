package httpapi

import (
	"context"
	"continua/backend/internal/auth"
	"continua/backend/internal/engine"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
)

type institutionalStore interface {
	InstitutionalRead(context.Context, string, string, string) ([]json.RawMessage, error)
	InstitutionalGraph(context.Context, string, *string) ([]json.RawMessage, error)
	InstitutionalRecord(context.Context, string, string, string, string, string, json.RawMessage, int64) error
	InstitutionalSave(context.Context, string, string, string, json.RawMessage, json.RawMessage) (json.RawMessage, error)
}

var institutionalActive sync.Map
var institutionalKinds = map[string]bool{"probabilistic-forecast": true, "monte-carlo": true, "liquidity": true, "exposure-graph": true, "research-case": true, "relationship-draft": true, "portfolio-liquidity": true}

func institutionalAccess(plan string, p map[string]any) bool {
	kind, _ := p["kind"].(string)
	if !institutionalKinds[kind] {
		return false
	}
	if plan == "premium_plus" {
		return true
	}
	if plan != "premium" {
		return false
	}
	if kind == "liquidity" {
		return true
	}
	if kind == "research-case" {
		cases, _ := p["scenarios"].([]any)
		return len(cases) == 0
	}
	if kind == "probabilistic-forecast" {
		if target, ok := p["target"].(string); ok && target != "price-return" {
			return false
		}
		if frequency, ok := p["frequency"].(string); ok && frequency != "session" {
			return false
		}
		horizon, ok := p["horizon"].(float64)
		if !ok {
			horizon = 5
		}
		method, _ := p["method"].(string)
		return horizon <= 20 && (method == "" || method == "automatic")
	}
	return false
}
func (s *Server) institutionalCompute(ctx context.Context, p any) (map[string]any, error) {
	if s.Engine == nil {
		return nil, errors.New("worker unavailable")
	}
	output, e := s.Engine.Calculate(ctx, engine.Request{Operation: "investment_research", Args: []any{p}})
	var envelope struct {
		Status int            `json:"status"`
		Data   map[string]any `json:"data"`
		Error  string         `json:"error"`
	}
	if e != nil || json.Unmarshal(output, &envelope) != nil {
		return nil, errors.New("worker unavailable")
	}
	if envelope.Status != 200 {
		return nil, &institutionalInputError{envelope.Error}
	}
	return envelope.Data, nil
}

type institutionalInputError struct{ message string }

func (e *institutionalInputError) Error() string { return e.message }
func (s *Server) institutionalOwned(ctx context.Context, store institutionalStore, owner string, p map[string]any, origins ...string) (map[string]any, error) {
	if _, loaded := institutionalActive.LoadOrStore(owner, true); loaded {
		return nil, errors.New("account calculation busy")
	}
	defer institutionalActive.Delete(owner)
	kind, _ := p["kind"].(string)
	models, e := store.InstitutionalRead(ctx, "model", "", kind)
	if e != nil || len(models) == 0 {
		return nil, errors.New("governance migration required")
	}
	var model struct {
		Status string `json:"status"`
	}
	if json.Unmarshal(models[0], &model) != nil || model.Status == "disabled" {
		return nil, errors.New("model disabled")
	}
	dependency := ""
	if p["kind"] == "monte-carlo" && p["method"] == "factor-bootstrap" {
		dependency = "factor-model"
	}
	if p["kind"] == "portfolio-liquidity" && p["optimization"] != nil {
		dependency = "optimization"
	}
	if dependency != "" {
		models, e := store.InstitutionalRead(ctx, "legacy-model", "", dependency)
		if e != nil || len(models) == 0 {
			return nil, errors.New("dependent model unavailable")
		}
		var dependent struct {
			Status string `json:"status"`
		}
		if json.Unmarshal(models[0], &dependent) != nil || dependent.Status == "disabled" {
			return nil, errors.New("dependent model disabled")
		}
	}
	start := time.Now()
	input, _ := json.Marshal(p)
	cacheDigest := sha256.Sum256(append([]byte(owner+":institutional-intelligence-v1:"), input...))
	cacheKey := "institutional-owned:" + hex.EncodeToString(cacheDigest[:])
	var data map[string]any
	if s.ReadCache != nil {
		cached := s.ReadCache.Get(cacheKey)
		if len(cached) > 0 {
			_ = json.Unmarshal(cached, &data)
		}
	}
	if data == nil {
		data, e = s.institutionalCompute(ctx, p)
		if e == nil && s.ReadCache != nil {
			encoded, _ := json.Marshal(data)
			s.ReadCache.Set(cacheKey, encoded, 30*time.Second)
		}
	}
	if e == nil {
		gov, ok := data["governance"].(map[string]any)
		hash, _ := gov["inputHash"].(string)
		if !ok || !regexp.MustCompile(`^[a-f0-9]{64}$`).MatchString(hash) {
			e = errors.New("model evidence envelope unavailable")
		} else {
			origin := "caller-provided evidence, not independently authenticated"
			if len(origins) > 0 {
				origin = origins[0]
			}
			gov["inputOrigin"] = origin
		}
	}
	digest := sha256.Sum256(input)
	hash := hex.EncodeToString(digest[:])
	state := "success"
	summary := map[string]any{}
	if e != nil {
		state = "worker-unavailable"
		var invalid *institutionalInputError
		if errors.As(e, &invalid) {
			state = "input-validation"
		}
	} else {
		gov, _ := data["governance"].(map[string]any)
		if h, ok := gov["inputHash"].(string); ok {
			hash = h
		}
		summary["available"] = data["available"]
		summary["numericalReconciliation"] = data["tailReconciliationError"]
		if validation, ok := data["validation"].(map[string]any); ok {
			summary["validationStatus"] = validation["status"]
			summary["coverage"] = validation["comparisons"]
		}
	}
	encoded, _ := json.Marshal(summary)
	recorded := store.InstitutionalRecord(ctx, owner, kind, "institutional-intelligence-v1", hash, state, encoded, time.Since(start).Milliseconds()) == nil
	if e == nil {
		if gov, ok := data["governance"].(map[string]any); ok {
			gov["recorded"] = recorded
		}
	}
	return data, e
}
func (s *Server) institutionalAsset(ctx context.Context, store institutionalStore, symbol string, lookbacks ...int) (map[string]any, error) {
	if !companySymbol.MatchString(symbol) {
		return nil, errors.New("invalid symbol")
	}
	rows, e := store.InstitutionalRead(ctx, "security", "", symbol)
	if e != nil || len(rows) != 1 {
		return nil, errors.New("unknown security")
	}
	var asset map[string]any
	if json.Unmarshal(rows[0], &asset) != nil {
		return nil, errors.New("invalid security")
	}
	history, ok := s.Store.(riskHistoryStore)
	if !ok {
		return nil, errors.New("history unavailable")
	}
	now := time.Now().UTC()
	bars, e := history.Candles(ctx, "NSE:"+symbol, "1d", now.Add(-time.Duration(institutionalLookback(lookbacks))*24*time.Hour), now)
	if e != nil {
		return nil, e
	}
	if len(bars) > 1501 {
		bars = bars[len(bars)-1501:]
	}
	actions, e := history.CorporateActions(ctx, "NSE:"+symbol)
	if e != nil {
		return nil, e
	}
	sourceURLs := []string{}
	indices := map[string]int{}
	compact := []map[string]any{}
	for _, raw := range bars {
		var bar struct {
			Date      string   `json:"date"`
			Timestamp string   `json:"timestamp"`
			Close     float64  `json:"close"`
			Volume    *float64 `json:"volume"`
			SourceURL string   `json:"sourceUrl"`
		}
		if json.Unmarshal(raw, &bar) != nil {
			continue
		}
		if bar.Date == "" && len(bar.Timestamp) >= 10 {
			bar.Date = bar.Timestamp[:10]
		}
		index, exists := indices[bar.SourceURL]
		if !exists {
			index = len(sourceURLs)
			indices[bar.SourceURL] = index
			sourceURLs = append(sourceURLs, bar.SourceURL)
		}
		compact = append(compact, map[string]any{"date": bar.Date, "close": bar.Close, "volume": bar.Volume, "sourceIndex": index})
	}
	asset["bars"] = compact
	asset["sourceUrls"] = sourceURLs
	asset["actions"] = actions
	return asset, nil
}
func (s *Server) institutional(ctx context.Context, w http.ResponseWriter, r *http.Request, id *auth.Identity) bool {
	prefix := "/api/v1/engine/institutional/"
	if !strings.HasPrefix(r.URL.Path, prefix) {
		return false
	}
	w.Header().Set("Cache-Control", "no-store")
	if id == nil {
		failure(w, 401, "Sign in to use institutional research")
		return true
	}
	path := strings.TrimPrefix(r.URL.Path, prefix)
	store, ok := s.Store.(institutionalStore)
	if !ok {
		failure(w, 503, "Institutional storage unavailable")
		return true
	}
	fail := func(e error) {
		var invalid *institutionalInputError
		if errors.As(e, &invalid) {
			failure(w, 422, invalid.Error())
		} else if e.Error() == "account calculation busy" {
			failure(w, 429, "An institutional calculation is already running for this account.")
		} else {
			failure(w, 503, "Institutional evidence or calculation unavailable")
		}
	}
	respondData := func(data any) { respond(w, 200, map[string]any{"data": data}) }
	today := time.Now().UTC().Format("2006-01-02")
	if strings.HasPrefix(path, "liquidity/") && r.Method == "GET" {
		symbol := strings.TrimPrefix(path, "liquidity/")
		asset, e := s.institutionalAsset(ctx, store, symbol)
		if e != nil {
			fail(e)
			return true
		}
		config, e := s.institutionalCompute(ctx, map[string]any{"kind": "institutional-inputs", "mode": "liquidity", "asOf": today, "assets": []any{asset}, "options": map[string]any{}})
		if e != nil {
			fail(e)
			return true
		}
		data, e := s.institutionalOwned(ctx, store, id.UserID, config, "server-prepared canonical evidence")
		if e != nil {
			fail(e)
			return true
		}
		if id.Plan != "premium" && id.Plan != "premium_plus" {
			basic := map[string]any{"symbol": symbol, "status": data["status"], "observationAgeDays": data["observationAgeDays"], "basic": true, "methodology": data["methodology"]}
			windows := []any{}
			if rows, ok := data["windows"].([]any); ok && len(rows) > 0 {
				if row, ok := rows[0].(map[string]any); ok {
					limited := map[string]any{}
					for _, key := range []string{"window", "observations", "knownVolume", "missingVolume", "averageDailyVolume", "noTradeFraction"} {
						limited[key] = row[key]
					}
					windows = append(windows, limited)
				}
			}
			basic["windows"] = windows
			respondData(basic)
		} else {
			data["configuration"] = config
			respondData(data)
		}
		return true
	}
	if id.Plan != "premium" && id.Plan != "premium_plus" {
		failure(w, 403, "Detailed institutional research requires Premium")
		return true
	}
	if path == "models" && r.Method == "GET" {
		if id.Plan != "premium_plus" {
			failure(w, 403, "Model registry requires Premium Plus")
			return true
		}
		rows, e := store.InstitutionalRead(ctx, "models", id.UserID, "")
		if e != nil {
			fail(e)
		} else {
			respondData(rows)
		}
		return true
	}
	if path == "snapshots" && r.Method == "GET" {
		rows, e := store.InstitutionalRead(ctx, "snapshots", id.UserID, "")
		if e != nil {
			fail(e)
		} else {
			respondData(rows)
		}
		return true
	}
	if strings.HasPrefix(path, "snapshots/") && (r.Method == "GET" || r.Method == "DELETE") {
		hash := strings.TrimPrefix(path, "snapshots/")
		if !regexp.MustCompile(`^[a-f0-9]{64}$`).MatchString(hash) {
			failure(w, 400, "Invalid snapshot hash")
			return true
		}
		operation := "snapshot"
		if r.Method == "DELETE" {
			operation = "delete-snapshot"
		}
		rows, e := store.InstitutionalRead(ctx, operation, id.UserID, hash)
		if e != nil {
			fail(e)
		} else if len(rows) == 0 {
			failure(w, 404, "Snapshot not found")
		} else {
			var saved map[string]any
			_ = json.Unmarshal(rows[0], &saved)
			if r.Method == "GET" {
				config, _ := saved["configuration"].(map[string]any)
				if !institutionalAccess(id.Plan, config) {
					failure(w, 403, "Snapshot model requires a higher subscription")
					return true
				}
				if config["kind"] == "exposure-graph" {
					cutoff, _ := config["asOf"].(string)
					var symbol *string
					if name, ok := config["symbol"].(string); ok {
						symbol = &name
					}
					edges, e := store.InstitutionalGraph(ctx, cutoff, symbol)
					if e != nil {
						fail(e)
						return true
					}
					allowed := map[string]bool{}
					for _, raw := range edges {
						var edge struct {
							ID string `json:"id"`
						}
						if json.Unmarshal(raw, &edge) == nil {
							allowed[edge.ID] = true
						}
					}
					if savedEdges, ok := config["edges"].([]any); ok {
						for _, raw := range savedEdges {
							edge, ok := raw.(map[string]any)
							id, _ := edge["id"].(string)
							if !ok || !allowed[id] {
								failure(w, 403, "Saved graph evidence is no longer source-eligible")
								return true
							}
						}
					}
				}

			}
			respondData(rows[0])
		}
		return true
	}
	if strings.HasPrefix(path, "profile/") && r.Method == "GET" {
		symbol := strings.TrimPrefix(path, "profile/")
		if !companySymbol.MatchString(symbol) {
			failure(w, 400, "Invalid symbol")
			return true
		}
		rows, e := store.InstitutionalRead(ctx, "financials", id.UserID, symbol)
		if e != nil {
			fail(e)
			return true
		}
		config, e := s.institutionalCompute(ctx, map[string]any{"kind": "institutional-profile", "symbol": symbol, "asOf": today, "financials": rows})
		if e != nil {
			fail(e)
			return true
		}
		data, e := s.institutionalOwned(ctx, store, id.UserID, config, "server-prepared canonical evidence")
		if e != nil {
			fail(e)
		} else {
			respondData(map[string]any{"configuration": config, "result": data})
		}
		return true
	}
	if r.Method != "POST" {
		failure(w, 405, "Method not allowed")
		return true
	}
	raw, e := io.ReadAll(http.MaxBytesReader(w, r.Body, 2097152))
	var input map[string]any
	if e != nil || json.Unmarshal(raw, &input) != nil || input == nil {
		failure(w, 400, "Invalid institutional research JSON")
		return true
	}
	switch {
	case path == "calculate" || path == "snapshots":
		config := input
		if path == "snapshots" {
			config, _ = input["configuration"].(map[string]any)
			name, _ := input["name"].(string)
			if len(strings.TrimSpace(name)) == 0 || len(name) > 100 {
				failure(w, 400, "A snapshot name is required")
				return true
			}
		}
		if !institutionalAccess(id.Plan, config) {
			failure(w, 403, "Institutional model requires a higher subscription")
			return true
		}
		if config["kind"] == "exposure-graph" {
			if path == "calculate" {
				failure(w, 400, "Use the source-verified graph endpoint; imported verification flags are not factual evidence")
				return true
			}
			cutoff, _ := config["asOf"].(string)
			var filter *string
			if symbol, ok := config["symbol"].(string); ok {
				if !companySymbol.MatchString(symbol) {
					failure(w, 400, "Invalid symbol")
					return true
				}
				filter = &symbol
			}
			edges, e := store.InstitutionalGraph(ctx, cutoff, filter)
			if e != nil {
				fail(e)
				return true
			}
			if len(edges) > 500 {
				failure(w, 422, "Select a smaller graph neighborhood")
				return true
			}
			config["edges"] = edges
			held, e := store.InstitutionalRead(ctx, "held", id.UserID, "")
			if e != nil {
				fail(e)
				return true
			}
			symbols := []string{}
			for _, raw := range held {
				var row struct {
					Symbol string `json:"symbol"`
				}
				if json.Unmarshal(raw, &row) == nil {
					symbols = append(symbols, "security:NSE:"+row.Symbol)
				}
			}
			config["portfolioSymbols"] = symbols
		}
		data, e := s.institutionalOwned(ctx, store, id.UserID, config)
		if e != nil {
			fail(e)
			return true
		}
		if path == "snapshots" {
			encoded, _ := json.Marshal(config)
			result, _ := json.Marshal(data)
			gov, _ := data["governance"].(map[string]any)
			hash, _ := gov["inputHash"].(string)
			saved, e := store.InstitutionalSave(ctx, id.UserID, strings.TrimSpace(input["name"].(string)), hash, encoded, result)
			if e != nil {
				fail(e)
			} else if string(saved) == "null" {
				failure(w, 422, "Snapshot quota or size limit reached")
			} else {
				respond(w, 201, map[string]any{"data": saved})
			}
		} else {
			respondData(data)
		}
	case strings.HasPrefix(path, "company/"):
		symbol := strings.TrimPrefix(path, "company/")
		mode, _ := input["mode"].(string)
		if mode != "liquidity" && mode != "forecast" {
			failure(w, 400, "Select forecast or liquidity")
			return true
		}
		asset, e := s.institutionalAsset(ctx, store, symbol)
		if e != nil {
			fail(e)
			return true
		}
		config, e := s.institutionalCompute(ctx, map[string]any{"kind": "institutional-inputs", "mode": mode, "asOf": today, "assets": []any{asset}, "options": input["options"]})
		if e != nil {
			fail(e)
			return true
		}
		if !institutionalAccess(id.Plan, config) {
			failure(w, 403, "Advanced forecast requires Premium Plus")
			return true
		}
		data, e := s.institutionalOwned(ctx, store, id.UserID, config, "server-prepared canonical evidence")
		if e != nil {
			fail(e)
		} else {
			respondData(map[string]any{"configuration": config, "result": data})
		}
	case path == "graph":
		if id.Plan != "premium_plus" {
			failure(w, 403, "Exposure Graph requires Premium Plus")
			return true
		}
		for key := range input {
			if key != "asOf" && key != "symbol" && key != "start" && key != "end" && key != "propagation" {
				failure(w, 400, "Unknown graph option")
				return true
			}
		}
		cutoff, _ := input["asOf"].(string)
		parsed, e := time.Parse("2006-01-02", cutoff)
		if e != nil || parsed.After(time.Now().UTC()) {
			failure(w, 400, "Invalid cutoff")
			return true
		}
		var symbol *string
		if name, ok := input["symbol"].(string); ok {
			if !companySymbol.MatchString(name) {
				failure(w, 400, "Invalid symbol")
				return true
			}
			symbol = &name
		}
		rows, e := store.InstitutionalGraph(ctx, cutoff, symbol)
		if e != nil {
			fail(e)
			return true
		}
		if len(rows) > 500 {
			failure(w, 422, "Select a smaller company neighborhood")
			return true
		}
		held, e := store.InstitutionalRead(ctx, "held", id.UserID, "")
		if e != nil {
			fail(e)
			return true
		}
		heldSymbols := []string{}
		for _, raw := range held {
			var row struct {
				Symbol string `json:"symbol"`
			}
			if json.Unmarshal(raw, &row) == nil {
				heldSymbols = append(heldSymbols, "security:NSE:"+row.Symbol)
			}
		}
		input["portfolioSymbols"] = heldSymbols
		input["kind"] = "exposure-graph"
		input["edges"] = rows
		data, e := s.institutionalOwned(ctx, store, id.UserID, input, "permission-gated reviewed relationships")
		if e != nil {
			fail(e)
		} else {
			respondData(map[string]any{"configuration": input, "result": data})
		}
	case path == "owned-liquidity":
		if id.Plan != "premium_plus" {
			failure(w, 403, "Portfolio liquidity requires Premium Plus")
			return true
		}
		valid := map[string]bool{"participation": true, "liquidationSessions": true, "minimumTradingFrequency": true, "optimize": true, "objective": true, "turnoverCap": true}
		for key := range input {
			if !valid[key] {
				failure(w, 400, "Unknown liquidity option")
				return true
			}
		}
		if value, present := input["optimize"]; present {
			if _, ok := value.(bool); !ok {
				failure(w, 400, "Explicit optimization boolean required")
				return true
			}
		}
		holdings, e := store.InstitutionalRead(ctx, "held", id.UserID, "")
		if e != nil {
			fail(e)
			return true
		}
		if len(holdings) == 0 || len(holdings) > 70 {
			failure(w, 422, "Liquidity requires 1–70 positive owned positions")
			return true
		}
		assets := []any{}
		for _, raw := range holdings {
			var holding struct {
				Symbol   string  `json:"symbol"`
				Quantity float64 `json:"quantity"`
			}
			if json.Unmarshal(raw, &holding) != nil {
				failure(w, 503, "Owned positions unavailable")
				return true
			}
			asset, e := s.institutionalAsset(ctx, store, holding.Symbol, 365)
			if e != nil {
				fail(e)
				return true
			}
			if bars, ok := asset["bars"].([]map[string]any); ok && len(bars) > 120 {
				asset["bars"] = bars[len(bars)-120:]
			}
			asset["quantity"] = holding.Quantity
			assets = append(assets, asset)
		}
		config := map[string]any{"kind": "portfolio-liquidity", "asOf": today, "assets": assets, "participation": input["participation"], "liquidationSessions": input["liquidationSessions"], "minimumTradingFrequency": input["minimumTradingFrequency"]}
		if optimize, _ := input["optimize"].(bool); optimize {
			if s.PortfolioResearch == nil {
				failure(w, 503, "Owned risk unavailable")
				return true
			}
			raw, e := s.PortfolioResearch.Research(ctx, id.UserID, "NSE")
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
						Covered     float64 `json:"coveredValue"`
						RiskCovered float64 `json:"riskCoveredValue"`
						Positions   []struct {
							Symbol string `json:"symbol"`
							Sector string `json:"sector"`
						} `json:"positions"`
					} `json:"overview"`
				} `json:"riskIntelligence"`
			}
			if e != nil || json.Unmarshal(raw, &portfolio) != nil {
				failure(w, 503, "Owned risk unavailable")
				return true
			}
			risk := portfolio.Risk
			if len(risk.Covariance) == 0 || risk.Overview.Covered != risk.Overview.RiskCovered {
				failure(w, 422, "Every holding requires eligible risk history")
				return true
			}
			for _, row := range risk.Coverage {
				if !row.Included {
					failure(w, 422, "Incomplete owned risk coverage")
					return true
				}
			}
			sectors := map[string]string{}
			for _, position := range risk.Overview.Positions {
				sectors[position.Symbol] = position.Sector
			}
			objective := input["objective"]
			if objective == nil {
				objective = "minimum-variance"
			}
			turnover := input["turnoverCap"]
			if turnover == nil {
				turnover = .25
			}
			config["optimization"] = map[string]any{"kind": "optimization", "objective": objective, "turnoverCap": turnover, "symbols": risk.Symbols, "currentWeights": risk.Weights, "covariance": risk.Covariance, "observations": risk.Evidence.Observations, "sectors": sectors}
		}
		data, e := s.institutionalOwned(ctx, store, id.UserID, config, "server-prepared canonical evidence")
		if e != nil {
			fail(e)
		} else {
			respondData(map[string]any{"configuration": config, "result": data})
		}
	case path == "owned-simulation":
		if id.Plan != "premium_plus" {
			failure(w, 403, "Owned simulations require Premium Plus")
			return true
		}
		if s.PortfolioResearch == nil {
			failure(w, 503, "Owned portfolio unavailable")
			return true
		}
		allowed := map[string]bool{}
		for _, key := range []string{"horizon", "paths", "method", "seed", "blockLength", "costBps", "rebalance", "confidence", "lossThreshold", "shocks", "inflationAnnual", "sessionsPerYear"} {
			allowed[key] = true
		}
		for key := range input {
			if !allowed[key] {
				failure(w, 400, "Unknown owned simulation option")
				return true
			}
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
				Overview struct {
					Covered     float64 `json:"coveredValue"`
					RiskCovered float64 `json:"riskCoveredValue"`
				} `json:"overview"`
				Evidence json.RawMessage `json:"evidence"`
			} `json:"riskIntelligence"`
		}
		if e != nil || json.Unmarshal(owned, &portfolio) != nil {
			failure(w, 503, "Owned risk unavailable")
			return true
		}
		risk := portfolio.Risk
		if len(risk.Symbols) == 0 || len(risk.Symbols) != len(risk.Weights) || len(risk.Covariance) == 0 || risk.Overview.Covered != risk.Overview.RiskCovered {
			failure(w, 422, "Every holding requires eligible aligned source history")
			return true
		}
		for _, row := range risk.Coverage {
			if !row.Included {
				failure(w, 422, "Incomplete owned coverage")
				return true
			}
		}
		assets := []any{}
		for i, symbol := range risk.Symbols {
			asset, e := s.institutionalAsset(ctx, store, symbol, 365)
			if e != nil {
				fail(e)
				return true
			}
			asset["weight"] = risk.Weights[i]
			assets = append(assets, asset)
		}
		config, e := s.institutionalCompute(ctx, map[string]any{"kind": "institutional-inputs", "mode": "simulation", "asOf": today, "assets": assets, "capital": risk.Overview.Covered, "portfolioSnapshot": risk.Evidence, "options": input})
		if e != nil {
			fail(e)
			return true
		}
		data, e := s.institutionalOwned(ctx, store, id.UserID, config, "server-prepared canonical evidence")
		if e != nil {
			fail(e)
		} else {
			respondData(map[string]any{"configuration": config, "result": data})
		}
	default:
		failure(w, 404, "Unknown institutional endpoint")
	}
	return true
}

func institutionalLookback(values []int) int {
	if len(values) > 0 && values[0] >= 120 && values[0] <= 2200 {
		return values[0]
	}
	return 2200
}
