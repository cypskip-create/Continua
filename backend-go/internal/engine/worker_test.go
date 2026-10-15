package engine

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func worker(t *testing.T) *Worker {
	t.Helper()
	python := os.Getenv("NATIVE_PYTHON_BIN")
	if python == "" {
		t.Skip("NATIVE_PYTHON_BIN is required for real Python integration")
	}
	script, err := filepath.Abs("../../../engine-python/worker.py")
	if err != nil {
		t.Fatal(err)
	}
	return NewWorker(python, script)
}

func TestDocumentWorkerHasSeparateOperationAndSizeBudget(t *testing.T) {
	normal := worker(t)
	document := NewDocumentWorker(normal.Python, normal.Script)
	input := Request{Operation: "document_publication_plan", Args: []any{map[string]any{"method": "ocr", "text": strings.Repeat("x", 3*1024*1024)}, []any{}}}
	if _, err := normal.Calculate(context.Background(), input); err == nil {
		t.Fatal("ordinary worker accepted document operation")
	}
	raw, err := document.Calculate(context.Background(), input)
	var result struct {
		Valid  bool   `json:"valid"`
		Reason string `json:"reason"`
	}
	if err != nil || json.Unmarshal(raw, &result) != nil || result.Valid || result.Reason == "" {
		t.Fatal(string(raw), err)
	}
	if _, err = document.Calculate(context.Background(), Request{Operation: "ratios", Args: []any{}}); err == nil {
		t.Fatal("document worker accepted unrelated operation")
	}
}
func TestRealPythonRatiosAndLabs(t *testing.T) {
	w := worker(t)
	raw, err := w.Calculate(context.Background(), Request{Operation: "ratios", Args: []any{map[string]any{"price": 30, "eps": 2}}})
	if err != nil {
		t.Fatal(err)
	}
	var result map[string]float64
	if err = json.Unmarshal(raw, &result); err != nil || result["pe"] != 15 {
		t.Fatal(string(raw), err)
	}
	raw, err = w.Calculate(context.Background(), Request{Operation: "earnings", Args: []any{2, 30, 3, 10, 15}})
	if err != nil || !json.Valid(raw) {
		t.Fatal(err)
	}
}
func TestUnknownAndCancelledRequestsCannotSpawn(t *testing.T) {
	w := worker(t)
	if _, err := w.Calculate(context.Background(), Request{Operation: "shell", Args: []any{"whoami"}}); err == nil {
		t.Fatal("unknown operation accepted")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := w.Calculate(ctx, Request{Operation: "ratios", Args: []any{map[string]any{"price": 30}}}); err == nil {
		t.Fatal("cancelled request succeeded")
	}
}

func TestRealPythonPortfolioOverviewAndRiskDiagnostics(t *testing.T) {
	w := worker(t)
	raw, err := w.Calculate(context.Background(), Request{Operation: "portfolio_overview", Args: []any{[]any{map[string]any{"symbol": "KCB", "price": 90, "shares": 10, "cost": 800, "change": 1, "volume": 1000, "currency": "KES", "sector": "Banking", "asOf": "2026-10-12T12:00:00.000Z"}}, "NSE", "2026-10-13T12:00:00.000Z"}})
	var result map[string]any
	if err != nil || json.Unmarshal(raw, &result) != nil || result["unrealized"] != float64(100) || result["sessionPnl"] != float64(10) {
		t.Fatal(string(raw), err)
	}
	raw, err = w.Calculate(context.Background(), Request{Operation: "portfolio_risk", Args: []any{map[string]any{}, map[string]any{}}})
	if err != nil || json.Unmarshal(raw, &result) != nil || result["available"] != false {
		t.Fatal(string(raw), err)
	}
	raw, err = w.Calculate(context.Background(), Request{Operation: "data_quality", Args: []any{nil, []any{}, "2026-10-13T12:00:00.000Z"}})
	if err != nil || !json.Valid(raw) {
		t.Fatal(string(raw), err)
	}
}
