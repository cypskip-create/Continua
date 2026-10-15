// Native review/operator client. Mutating operations default to offline plans.
package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

func readJSON(path string) ([]byte, error) {
	var reader io.Reader = os.Stdin
	if path != "-" {
		file, err := os.Open(path)
		if err != nil {
			return nil, errors.New("review file unavailable")
		}
		defer file.Close()
		stat, err := file.Stat()
		if err != nil || !stat.Mode().IsRegular() || stat.Size() > 1048576 {
			return nil, errors.New("review file exceeds budget")
		}
		reader = file
	}
	raw, err := io.ReadAll(io.LimitReader(reader, 1048577))
	if err != nil || len(raw) > 1048576 || !json.Valid(raw) {
		return nil, errors.New("bounded review JSON required")
	}
	var object map[string]json.RawMessage
	if json.Unmarshal(raw, &object) != nil || object == nil {
		return nil, errors.New("review object required")
	}
	return raw, nil
}

func run(args []string, output io.Writer) error {
	flags := flag.NewFlagSet("continua-review", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	operation := flags.String("operation", "", "native operator operation")
	candidate := flags.Int64("candidate", 0, "candidate identifier")
	extraction := flags.Int64("extraction", 0, "reviewed source extraction identifier")
	limit := flags.Int("limit", 100, "bounded candidate list")
	input := flags.String("review-file", "", "JSON file, or - for stdin")
	note := flags.String("note", "", "private rejection note")
	job := flags.String("job", "", "registered native job")
	apply := flags.Bool("apply", false, "explicitly submit a mutating operator request")
	if flags.Parse(args) != nil || flags.NArg() != 0 {
		return errors.New("invalid native review arguments")
	}
	method, path := "GET", ""
	body := []byte(nil)
	mutates := false
	switch *operation {
	case "repair-condensed", "validate-condensed-repair":
		if *extraction < 1 {
			return errors.New("explicit reviewed source extraction required")
		}
		mutates = *operation == "repair-condensed"
		method = "POST"
		path = "financials/repair-condensed"
		body, _ = json.Marshal(map[string]any{"extractionId": *extraction, "apply": mutates})
	case "reviewed-transcription", "validate-transcription":
		if *input == "" {
			return errors.New("explicit reviewed transcription JSON required")
		}
		var err error
		body, err = readJSON(*input)
		if err != nil {
			return err
		}
		method = "POST"
		mutates = *operation == "reviewed-transcription"
		path = "financials/reviewed-transcription?apply=false"
		if mutates {
			path = "financials/reviewed-transcription?apply=true"
		}
	case "list-candidates":
		if *limit < 1 || *limit > 100 {
			return errors.New("review limit must be 1 to 100")
		}
		path = "financials/candidates?limit=" + strconv.Itoa(*limit)
	case "candidate":
		if *candidate <= 0 {
			return errors.New("candidate identifier required")
		}
		path = "financials/candidates/" + strconv.FormatInt(*candidate, 10)
	case "confirm", "confirm-single", "reject":
		if *candidate <= 0 {
			return errors.New("candidate identifier required")
		}
		mutates = true
		method = "POST"
		action := "confirm-history"
		if *operation == "confirm-single" {
			action = "confirm"
		}
		if *operation == "reject" {
			action = "reject"
			if len(*note) > 8000 {
				return errors.New("review note too long")
			}
			body, _ = json.Marshal(map[string]string{"note": *note})
		} else {
			if *input == "" {
				return errors.New("explicit source-backed review JSON required")
			}
			var err error
			body, err = readJSON(*input)
			if err != nil {
				return err
			}
		}
		path = "financials/candidates/" + strconv.FormatInt(*candidate, 10) + "/" + action
	case "run-job":
		if !map[string]bool{"source-price-request": true, "source-listing-bootstrap": true, "source-candle-backfill": true, "document-publication": true, "financial-candidates": true, "news-bridge": true, "announcements": true, "daily-close-publication": true, "quote-publication": true, "index-publication": true, "collect-news": true, "collect-documents": true, "collect-indices": true, "research-refresh": true}[*job] {
			return errors.New("explicit registered native job required")
		}
		method = "POST"
		mutates = true
		path = "jobs/" + *job
		body = []byte(`{}`)
	case "runtime":
		path = "runtime"
	case "securities":
		path = "securities?exchange=NSE"
	default:
		return errors.New("operation must be list-candidates, candidate, confirm, confirm-single, reject, reviewed-transcription, validate-transcription, repair-condensed, validate-condensed-repair, run-job, runtime or securities")
	}
	if mutates && !*apply {
		digest := sha256.Sum256(body)
		return json.NewEncoder(output).Encode(map[string]any{"mode": "offline-plan", "operation": *operation, "method": method, "path": "/api/v1/admin/" + path, "payloadSha256": hex.EncodeToString(digest[:]), "submitted": false})
	}
	origin, err := url.Parse(os.Getenv("NATIVE_ADMIN_ORIGIN"))
	if err != nil || origin.Hostname() == "" || origin.User != nil || origin.RawQuery != "" || origin.Fragment != "" || (origin.Path != "" && origin.Path != "/") {
		return errors.New("explicit native admin origin required")
	}
	local := origin.Hostname() == "127.0.0.1" || origin.Hostname() == "localhost" || origin.Hostname() == "::1"
	if origin.Scheme != "https" && !(origin.Scheme == "http" && local) {
		return errors.New("HTTPS admin origin required")
	}
	key := os.Getenv("ADMIN_API_KEY")
	if len(key) < 32 || len(key) > 512 || strings.TrimSpace(key) != key {
		return errors.New("server-only admin credentials required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 65*time.Second)
	defer cancel()
	endpoint := strings.TrimRight(origin.String(), "/") + "/api/v1/admin/" + path
	request, err := http.NewRequestWithContext(ctx, method, endpoint, bytes.NewReader(body))
	if err != nil {
		return errors.New("operator request rejected")
	}
	request.Header.Set("X-Admin-Key", key)
	request.Header.Set("Accept", "application/json")
	if method == "POST" {
		request.Header.Set("Content-Type", "application/json")
	}
	client := &http.Client{Timeout: 65 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return errors.New("operator redirects prohibited") }}
	defer client.CloseIdleConnections()
	healthRequest, err := http.NewRequestWithContext(ctx, "GET", strings.TrimRight(origin.String(), "/")+"/api/v1/health/live", nil)
	if err != nil {
		return errors.New("native operator origin rejected")
	}
	healthResponse, err := client.Do(healthRequest)
	if err != nil {
		return errors.New("native operator liveness unavailable")
	}
	healthRaw, healthErr := io.ReadAll(io.LimitReader(healthResponse.Body, 4097))
	_ = healthResponse.Body.Close()
	var health struct{ Implementation, Status string }
	if healthErr != nil || len(healthRaw) > 4096 || healthResponse.StatusCode != 200 || json.Unmarshal(healthRaw, &health) != nil || health.Implementation != "go" || health.Status != "alive" {
		return errors.New("operator origin is not the native Go backend")
	}
	response, err := client.Do(request)
	if err != nil {
		return errors.New("native operator service unavailable")
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, 4*1024*1024+1))
	if err != nil || len(raw) > 4*1024*1024 || !json.Valid(raw) {
		return errors.New("native operator response rejected")
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("native operator request rejected with HTTP %d", response.StatusCode)
	}
	_, err = output.Write(append(raw, '\n'))
	return err
}

func main() {
	if err := run(os.Args[1:], os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		os.Exit(1)
	}
}
