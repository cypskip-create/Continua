package engine

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"os/exec"
	"sync"
	"time"
)

type EvidenceInvoke func(Request) (json.RawMessage, error)

// One bounded native process handles successive small evidence pages. This
// avoids dozens of interpreter startups and never buffers an entire news scan.
// Invocation is strictly serial within a session; callers cannot supply code.
func (w *Worker) WithEvidence(ctx context.Context, work func(EvidenceInvoke) error) error {
	if !w.evidence || work == nil {
		return errors.New("invalid evidence session")
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	select {
	case w.slots <- struct{}{}:
	case <-ctx.Done():
		return ctx.Err()
	}
	defer func() { <-w.slots }()
	select {
	case processAdmission <- struct{}{}:
	case <-ctx.Done():
		return ctx.Err()
	}
	defer func() { <-processAdmission }()
	cmd := exec.CommandContext(ctx, w.Python, w.Script, "--evidence-stream")
	for _, key := range []string{"PATH", "SystemRoot", "WINDIR"} {
		if value, ok := os.LookupEnv(key); ok {
			cmd.Env = append(cmd.Env, key+"="+value)
		}
	}
	cmd.Env = append(cmd.Env, "PYTHONUTF8=1")
	cmd.Stderr = io.Discard
	input, err := cmd.StdinPipe()
	if err != nil {
		return errors.New("evidence input unavailable")
	}
	output, err := cmd.StdoutPipe()
	if err != nil {
		input.Close()
		return errors.New("evidence output unavailable")
	}
	if err = cmd.Start(); err != nil {
		input.Close()
		output.Close()
		return errors.New("evidence process unavailable")
	}
	finished := false
	defer func() {
		input.Close()
		output.Close()
		if !finished {
			cancel()
			_ = cmd.Wait()
		}
	}()
	scanner := bufio.NewScanner(output)
	scanner.Buffer(make([]byte, 65536), 16777217)
	invocations := 0
	var invocationLock sync.Mutex
	invoke := func(request Request) (json.RawMessage, error) {
		invocationLock.Lock()
		defer invocationLock.Unlock()
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		if !evidenceAllowed[request.Operation] || request.Args == nil || invocations >= 1000 {
			return nil, errors.New("invalid evidence invocation")
		}
		invocations++
		raw, e := json.Marshal(request)
		if e != nil || len(raw) > 33554432 {
			return nil, errors.New("evidence input limit")
		}
		raw = append(raw, '\n')
		if _, e = input.Write(raw); e != nil {
			return nil, errors.New("evidence process rejected input")
		}
		if !scanner.Scan() {
			return nil, errors.New("evidence process rejected request")
		}
		result := append(json.RawMessage(nil), scanner.Bytes()...)
		if len(result) > 16777216 || !json.Valid(result) {
			return nil, errors.New("invalid evidence response")
		}
		return result, nil
	}
	err = work(invoke)
	input.Close()
	if err != nil {
		cancel()
	}
	processErr := cmd.Wait()
	finished = true
	output.Close()
	if err != nil {
		return err
	}
	if processErr != nil {
		return errors.New("evidence process failed")
	}
	return nil
}
