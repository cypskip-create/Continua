package engine

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"os/exec"
	"strings"
	"time"
)

var allowed = map[string]bool{"aggregate_candles": true, "ratios": true, "yoy": true, "annual_ratio": true, "sma": true, "ema": true, "rsi": true, "macd": true, "crossover": true, "stress": true, "bond": true, "futures": true, "earnings": true,
	"record_interest": true, "recommendations": true, "evaluate_monitor": true, "trailing_dividend": true, "portfolio_analysis": true, "performance": true, "aligned_returns": true, "daily_close_map": true, "reported_ratios": true, "source_financial_tables": true, "publisher_profile": true, "issuer_identity": true, "issuer_masthead": true, "validate_preferences": true,
	"risk_contributions": true, "portfolio_risk": true, "total_return_series": true, "portfolio_overview": true,
	"analyze_financials": true, "data_quality": true, "scenarios": true,
	"validate_historical_confirmation": true, "resolve_company_entity": true, "native_annual_report": true,
	"company_briefing": true, "research_synthesis": true,
	"condensed_group_report": true, "safaricom_press_report": true,
	"kakuzi_group_report": true, "kcb_group_report": true,
	"kakuzi_html_record": true, "draft_cbk_bond_report": true,
	"research_readiness": true, "evidence_fingerprint": true, "changes_between": true,
	"afri_score": true, "company_diagnostics": true, "summarize_news": true,
	"assemble_company_bundle": true,
	"analyze_news_issuers":    true, "article_evidence_text": true, "clean_article_content": true,
	"is_financial_news": true, "dedupe_news": true, "news_impact": true,
	"relative_valuation": true, "dividend_discount": true, "valuation_bundle": true,
	"research_snapshot": true, "technical_results": true, "map_news_rows": true, "valuation_history": true,
	"classify_news_category": true, "news_ingestion_input": true, "news_revalidation": true, "announcement_ingestion_input": true, "filing_draft": true, "simulate_execution": true, "backtest": true, "volume_profile": true}

var evidenceAllowed = map[string]bool{"map_news_rows": true, "dedupe_news": true, "news_ingestion_input": true, "news_revalidation": true, "announcement_ingestion_input": true}

func init() { allowed["normalize_fundamentals_bundle"] = true }
func init() { allowed["aggregate_touched_candles"] = true }
func init() { allowed["map_nse_batch"] = true; allowed["map_nse_fundamentals"] = true }

func init() {
	allowed["monitor_evaluation"] = true
	allowed["validate_forecast"] = true
	allowed["private_calibration"] = true
}

func init() { allowed["analyse_market"] = true }

func init() { allowed["lab_calculation"] = true }
func init() { allowed["earnings_lab"] = true }
func init() { allowed["snapshot_plan"] = true }
func init() { allowed["stress_workspace"] = true }
func init() { allowed["calculated_answer"] = true; allowed["validate_assistant_answer"] = true }

func init() { allowed["map_feed"] = true; allowed["normalize_feed"] = true }

func init() { allowed["map_fundamentals"] = true }

type Worker struct {
	Python, Script string
	slots          chan struct{}
	document       bool
	evidence       bool
	research       bool
}

var processAdmission = make(chan struct{}, 2)

type Request struct {
	Operation string `json:"operation"`
	Args      []any  `json:"args"`
}

func NewWorker(python, script string) *Worker {
	return &Worker{Python: python, Script: script, slots: make(chan struct{}, 2)}
}

// Document validation is serial and independently bounded; ordinary research
// never gains this larger input/deadline allowance.
func NewDocumentWorker(python, script string) *Worker {
	return &Worker{Python: python, Script: script, slots: make(chan struct{}, 1), document: true}
}
func NewEvidenceWorker(python, script string) *Worker {
	return &Worker{Python: python, Script: script, slots: make(chan struct{}, 1), evidence: true}
}
func NewResearchWorker(python, script string) *Worker {
	return &Worker{Python: python, Script: script, slots: make(chan struct{}, 1), research: true}
}

type limitedBuffer struct {
	bytes.Buffer
	max int
}

func (b *limitedBuffer) Write(p []byte) (int, error) {
	if len(p) > b.max-b.Len() {
		return 0, errors.New("worker output limit")
	}
	return b.Buffer.Write(p)
}
func (w *Worker) Calculate(ctx context.Context, request Request) (json.RawMessage, error) {
	if (w.document && request.Operation != "document_publication_plan" && request.Operation != "condensed_group_report") || (w.evidence && !evidenceAllowed[request.Operation]) || (w.research && request.Operation != "run_advanced" && request.Operation != "portfolio_workspace" && request.Operation != "assistant_answer" && request.Operation != "assistant_evidence") || (!w.document && !w.evidence && !w.research && !allowed[request.Operation]) || request.Args == nil {
		return nil, errors.New("invalid engine operation")
	}
	inputLimit, deadline := 2097152, 5*time.Second
	if w.document {
		inputLimit, deadline = 16777216, 30*time.Second
	}
	outputLimit := 4194304
	if w.research {
		inputLimit = 8388608
	}
	if w.evidence {
		inputLimit, outputLimit, deadline = 33554432, 16777216, 30*time.Second
	}
	// Include queue time in the deadline; never build an unbounded subprocess backlog.
	ctx, cancel := context.WithTimeout(ctx, deadline)
	defer cancel()
	select {
	case w.slots <- struct{}{}:
	case <-ctx.Done():
		return nil, errors.New("engine deadline exceeded")
	}
	defer func() { <-w.slots }()
	select {
	case processAdmission <- struct{}{}:
	case <-ctx.Done():
		return nil, errors.New("engine deadline exceeded")
	}
	defer func() { <-processAdmission }()
	// All profiles share process admission. Marshal only after admission so
	// queued large evidence requests do not allocate extra input copies at once.
	input, err := json.Marshal(request)
	if err != nil || len(input) > inputLimit {
		return nil, errors.New("invalid engine input")
	}
	args := []string{w.Script}
	if w.document {
		args = append(args, "--document")
	}
	if w.evidence {
		args = append(args, "--evidence")
	}
	if w.research {
		args = append(args, "--research")
	}
	cmd := exec.CommandContext(ctx, w.Python, args...)
	cmd.Stdin = bytes.NewReader(input)
	for _, key := range []string{"PATH", "SystemRoot", "WINDIR"} {
		if value, ok := os.LookupEnv(key); ok {
			cmd.Env = append(cmd.Env, key+"="+value)
		}
	}
	cmd.Env = append(cmd.Env, "PYTHONUTF8=1")
	output := &limitedBuffer{max: outputLimit}
	cmd.Stdout = output
	cmd.Stderr = io.Discard
	if err := cmd.Run(); err != nil {
		return nil, errors.New("engine calculation rejected")
	}
	raw := json.RawMessage(strings.TrimSpace(output.String()))
	if !json.Valid(raw) {
		return nil, errors.New("invalid engine response")
	}
	return raw, nil
}
