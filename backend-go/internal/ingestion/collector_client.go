package ingestion

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type CollectorClient struct {
	base   *url.URL
	client *http.Client
}

func NewCollectorClient(origin string, allowLoopback bool) (*CollectorClient, error) {
	u, e := url.Parse(origin)
	if e != nil || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") {
		return nil, errors.New("invalid native collector origin")
	}
	local := u.Hostname() == "127.0.0.1" || u.Hostname() == "localhost" || u.Hostname() == "::1"
	if u.Scheme != "https" && !(u.Scheme == "http" && allowLoopback && local) {
		return nil, errors.New("secure native collector origin required")
	}
	u.Path = ""
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.MaxConnsPerHost = 2
	transport.MaxIdleConnsPerHost = 2
	transport.ResponseHeaderTimeout = 10 * time.Second
	return &CollectorClient{base: u, client: &http.Client{Transport: transport, Timeout: 65 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return errors.New("collector redirects prohibited") }}}, nil
}
func (c *CollectorClient) request(ctx context.Context, method, path string) ([]byte, error) {
	u := *c.base
	u.Path = path
	r, e := http.NewRequestWithContext(ctx, method, u.String(), nil)
	if e != nil {
		return nil, e
	}
	r.Header.Set("Accept", "application/json")
	response, e := c.client.Do(r)
	if e != nil {
		return nil, errors.New("native collector unavailable")
	}
	defer response.Body.Close()
	raw, e := io.ReadAll(io.LimitReader(response.Body, 4097))
	if e != nil || len(raw) > 4096 || response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, errors.New("native collector response rejected")
	}
	return raw, nil
}
func (c *CollectorClient) Refresh(ctx context.Context, kind string) error {
	if !map[string]bool{"indices": true, "news": true, "documents": true}[kind] {
		return errors.New("invalid collector refresh kind")
	}
	// A migration candidate must never invoke the legacy Node collector as its
	// implementation. Check the native liveness contract before a refresh.
	raw, e := c.request(ctx, "GET", "/health/live")
	if e != nil {
		return e
	}
	var health struct{ Implementation, Runtime, Status string }
	if json.Unmarshal(raw, &health) != nil || health.Implementation != "python" || health.Runtime != "python" || health.Status != "alive" {
		return errors.New("collector is not the native Python implementation")
	}
	raw, e = c.request(ctx, "POST", "/"+kind+"/refresh")
	if e != nil {
		return e
	}
	var result struct{ Status string }
	if json.Unmarshal(raw, &result) != nil || !map[string]bool{"accepted": true, "checked": true}[strings.ToLower(result.Status)] {
		return errors.New("invalid native collector acknowledgement")
	}
	return nil
}
func (c *CollectorClient) Close() { c.client.CloseIdleConnections() }
