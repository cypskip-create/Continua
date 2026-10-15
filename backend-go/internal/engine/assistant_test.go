package engine

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
)

type assistantLedgerFixture struct {
	owners []string
	states []string
	reject error
}

func (f *assistantLedgerFixture) ReserveAI(_ context.Context, owner, model string, reserve, cap float64, limit int) (string, error) {
	if model != AssistantModel || reserve <= 0 || cap != 5 || limit != 20 {
		return "", errors.New("invalid fixture budget")
	}
	f.owners = append(f.owners, owner)
	return "fixture-usage", f.reject
}
func (f *assistantLedgerFixture) FinishAI(_ context.Context, id, state string, input, output *int64) error {
	f.states = append(f.states, state)
	return nil
}

type assistantRoundTrip func(*http.Request) (*http.Response, error)

func (f assistantRoundTrip) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func providerFixture(t *testing.T, enabled bool, response string, status int) (*Assistant, *assistantLedgerFixture, *int) {
	t.Helper()
	ledger := new(assistantLedgerFixture)
	calls := new(int)
	s := NewAssistant(ledger, worker(t), "sk-fixture-never-live", enabled, 5, 20)
	s.client.Transport = assistantRoundTrip(func(r *http.Request) (*http.Response, error) {
		(*calls)++
		if r.URL.String() != "https://api.openai.com/v1/responses" || r.Header.Get("Authorization") != "Bearer sk-fixture-never-live" {
			t.Fatal("incorrect private provider boundary")
		}
		var body map[string]json.RawMessage
		if json.NewDecoder(r.Body).Decode(&body) != nil || string(body["store"]) != "false" || string(body["max_output_tokens"]) != "1200" {
			t.Fatal("provider retention or output bounds changed")
		}
		return &http.Response{StatusCode: status, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(response)), Request: r}, nil
	})
	return s, ledger, calls
}

var assistantEvidence = json.RawMessage(`[{"id":"KCB:company","title":"Observed issuer","facts":{},"asOf":null,"url":null}]`)

const assistantCompleted = `{"status":"completed","output":[{"content":[{"type":"output_text","text":"{\"answer\":\"Dated source evidence.\",\"citations\":[\"KCB:company\"],\"limitations\":[\"Not a forecast\"]}"}]}],"usage":{"input_tokens":120,"output_tokens":30}}`

func TestAssistantDisabledKeyDoesNotSpendOrReserve(t *testing.T) {
	s, ledger, calls := providerFixture(t, false, "", 200)
	raw, err := s.Ask(context.Background(), "owner", "Revenue?", assistantEvidence, nil)
	if err != nil || !strings.Contains(string(raw), "no generative AI used") || *calls != 0 || len(ledger.owners) != 0 {
		t.Fatal("disabled provider made a request", err)
	}
}
func TestAssistantValidatesCitationsCachesAndSeparatesOwners(t *testing.T) {
	s, ledger, calls := providerFixture(t, true, assistantCompleted, 200)
	for _, owner := range []string{"owner-a", "owner-a", "owner-b"} {
		raw, err := s.Ask(context.Background(), owner, "Revenue?", assistantEvidence, nil)
		if err != nil || !strings.Contains(string(raw), `"sources"`) {
			t.Fatal("valid provider receipt failed", err)
		}
	}
	if *calls != 2 || strings.Join(ledger.owners, ",") != "owner-a,owner-b" || strings.Join(ledger.states, ",") != "complete,complete" {
		t.Fatal("cache ownership/accounting mismatch")
	}
}
func TestAssistantRejectsUnknownCitationsAndIncompleteProviderReceipts(t *testing.T) {
	for _, response := range []string{strings.ReplaceAll(assistantCompleted, "KCB:company", "invented-source"), `{"status":"incomplete","output":[]}`, `{"status":"completed","output":[{"content":[{"type":"refusal","text":"No"}]}]}`} {
		s, ledger, _ := providerFixture(t, true, response, 200)
		if _, err := s.Ask(context.Background(), "owner", "Revenue?", assistantEvidence, nil); err == nil {
			t.Fatal("invalid source/response accepted")
		}
		if strings.Join(ledger.states, ",") != "failed" {
			t.Fatal("failed reservation lost")
		}
	}
}
func TestAssistantProviderErrorTextCannotEscapeAndReservationRemains(t *testing.T) {
	for _, test := range []struct {
		status   int
		body     string
		expected int
	}{
		{401, `{"error":{"message":"secret=private","code":"invalid_api_key"}}`, 502},
		{429, `{"error":{"message":"private"}}`, 429},
		{429, `{"error":{"code":"insufficient_quota"}}`, 503},
	} {
		s, ledger, _ := providerFixture(t, true, test.body, test.status)
		_, err := s.Ask(context.Background(), "owner", "Revenue?", assistantEvidence, nil)
		var failure *AssistantError
		if !errors.As(err, &failure) || failure.Status != test.expected || strings.Contains(err.Error(), "private") || strings.Join(ledger.states, ",") != "failed" {
			t.Fatal("unsafe provider failure handling")
		}
	}
}
func TestAssistantCannotFollowCredentialRedirects(t *testing.T) {
	s, ledger, calls := providerFixture(t, true, "", 200)
	s.client.Transport = assistantRoundTrip(func(r *http.Request) (*http.Response, error) {
		(*calls)++
		return &http.Response{StatusCode: 302, Header: http.Header{"Location": []string{"https://attacker.example/"}}, Body: io.NopCloser(strings.NewReader("")), Request: r}, nil
	})
	if _, err := s.Ask(context.Background(), "owner", "Revenue?", assistantEvidence, nil); err == nil || *calls != 1 || strings.Join(ledger.states, ",") != "failed" {
		t.Fatal("provider credential redirect followed")
	}
}
