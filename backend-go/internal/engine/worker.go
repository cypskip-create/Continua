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
	"analyze_financials": true, "data_quality": true, "scenarios": true}

type Worker struct {
	Python, Script string
	slots          chan struct{}
}
type Request struct {
	Operation string `json:"operation"`
	Args      []any  `json:"args"`
}

func NewWorker(python, script string) *Worker {
	return &Worker{Python: python, Script: script, slots: make(chan struct{}, 2)}
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
	if !allowed[request.Operation] || request.Args == nil {
		return nil, errors.New("invalid engine operation")
	}
	input, err := json.Marshal(request)
	if err != nil || len(input) > 2097152 {
		return nil, errors.New("invalid engine input")
	}
	// Include queue time in the deadline; never build an unbounded subprocess backlog.
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	select {
	case w.slots <- struct{}{}:
	case <-ctx.Done():
		return nil, errors.New("engine deadline exceeded")
	}
	defer func() { <-w.slots }()
	cmd := exec.CommandContext(ctx, w.Python, w.Script)
	cmd.Stdin = bytes.NewReader(input)
	for _, key := range []string{"PATH", "SystemRoot", "WINDIR"} {
		if value, ok := os.LookupEnv(key); ok {
			cmd.Env = append(cmd.Env, key+"="+value)
		}
	}
	cmd.Env = append(cmd.Env, "PYTHONUTF8=1")
	output := &limitedBuffer{max: 4194304}
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
