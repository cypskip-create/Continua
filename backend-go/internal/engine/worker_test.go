package engine

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
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
