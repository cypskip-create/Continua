package billing

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"
)

// Provider has no arbitrary URL or raw-card API. Keys never leave the fixed
// Paystack origin, redirects are rejected, and ambiguous calls are not retried.
type Provider struct {
	client *http.Client
	keys   map[string]string
}
type ProviderAPI interface {
	Call(context.Context, string, string, any) (json.RawMessage, error)
}
type Error struct {
	Status  int
	Message string
}

func (e *Error) Error() string                 { return e.Message }
func problem(status int, message string) error { return &Error{status, message} }

func NewProvider(liveKey, testKey string) *Provider {
	return &Provider{client: &http.Client{Timeout: 15 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}, keys: map[string]string{"live": liveKey, "test": testKey}}
}
func (p *Provider) Call(ctx context.Context, mode, path string, body any) (json.RawMessage, error) {
	key := p.keys[mode]
	if (mode != "live" && mode != "test") || !strings.HasPrefix(key, "sk_"+mode+"_") {
		return nil, problem(503, "Payment mode is not configured.")
	}
	method := http.MethodGet
	switch {
	case path == "/transaction/initialize" || path == "/charge" || path == "/transaction/charge_authorization":
		if body == nil {
			return nil, problem(400, "Invalid payment operation.")
		}
		method = http.MethodPost
	case strings.HasPrefix(path, "/transaction/verify/"):
		if body != nil || !ValidReference(strings.TrimPrefix(path, "/transaction/verify/")) {
			return nil, problem(400, "Invalid checkout reference.")
		}
	default:
		return nil, problem(400, "Invalid payment operation.")
	}
	var encoded []byte
	var err error
	if body != nil {
		encoded, err = json.Marshal(body)
		if err != nil || len(encoded) > 65536 {
			return nil, problem(400, "Invalid payment request.")
		}
	}
	req, err := http.NewRequestWithContext(ctx, method, "https://api.paystack.co"+path, bytes.NewReader(encoded))
	if err != nil {
		return nil, problem(400, "Invalid payment request.")
	}
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("Content-Type", "application/json")
	res, err := p.client.Do(req)
	if err != nil {
		return nil, problem(502, "Payment provider could not be reached. Please retry verification before paying again.")
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, problem(502, "Payment provider is unavailable. Check payment status before trying again.")
	}
	raw, err := io.ReadAll(io.LimitReader(res.Body, 1048577))
	if err != nil || len(raw) > 1048576 {
		return nil, problem(502, "Payment provider returned an unexpected response.")
	}
	var envelope struct {
		Status bool            `json:"status"`
		Data   json.RawMessage `json:"data"`
	}
	if json.Unmarshal(raw, &envelope) != nil || !envelope.Status || len(envelope.Data) == 0 || bytes.Equal(envelope.Data, []byte("null")) {
		return nil, problem(502, "Payment provider returned an unexpected response.")
	}
	return envelope.Data, nil
}
func Status(err error) int {
	var p *Error
	if errors.As(err, &p) {
		return p.Status
	}
	return 500
}
