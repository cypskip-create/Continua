package cache

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type UpstashRemote struct {
	origin, token, namespace string
	client                   *http.Client
}

func NewUpstashRemote(origin, token, namespace string) (*UpstashRemote, error) {
	u, e := url.Parse(origin)
	if e != nil || u.Scheme != "https" || !strings.HasSuffix(strings.ToLower(u.Hostname()), ".upstash.io") || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") || token == "" || len(token) > 4096 || strings.ContainsAny(token, "\r\n\x00") || !namespacePattern.MatchString(namespace) {
		return nil, errors.New("invalid Upstash cache configuration")
	}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.MaxConnsPerHost = 2
	transport.MaxIdleConnsPerHost = 2
	transport.ResponseHeaderTimeout = time.Second
	return &UpstashRemote{origin: origin, token: token, namespace: namespace, client: &http.Client{Transport: transport, Timeout: 1500 * time.Millisecond, CheckRedirect: func(*http.Request, []*http.Request) error { return errors.New("cache redirects prohibited") }}}, nil
}
func (u *UpstashRemote) command(ctx context.Context, parts []any) (json.RawMessage, error) {
	encoded, e := json.Marshal(parts)
	if e != nil || len(encoded) > 8*1024*1024+65536 {
		return nil, errors.New("cache command budget")
	}
	request, e := http.NewRequestWithContext(ctx, "POST", u.origin, bytes.NewReader(encoded))
	if e != nil {
		return nil, errors.New("invalid cache command")
	}
	request.Header.Set("Authorization", "Bearer "+u.token)
	request.Header.Set("Content-Type", "application/json")
	response, e := u.client.Do(request)
	if e != nil {
		return nil, errors.New("cache request unavailable")
	}
	defer response.Body.Close()
	raw, e := io.ReadAll(io.LimitReader(response.Body, 8*1024*1024+65537))
	if e != nil || len(raw) > 8*1024*1024+65536 || response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, errors.New("cache response rejected")
	}
	var envelope struct {
		Result json.RawMessage
		Error  json.RawMessage
	}
	if json.Unmarshal(raw, &envelope) != nil || len(envelope.Error) > 0 && string(envelope.Error) != "null" || envelope.Result == nil {
		return nil, errors.New("cache command rejected")
	}
	return envelope.Result, nil
}
func (u *UpstashRemote) key(key string) string { return u.namespace + ":" + key }
func (u *UpstashRemote) Get(ctx context.Context, key string) (json.RawMessage, error) {
	raw, e := u.command(ctx, []any{"GET", u.key(key)})
	if e != nil {
		return nil, e
	}
	if string(raw) == "null" {
		return nil, nil
	}
	var text string
	if json.Unmarshal(raw, &text) != nil {
		return nil, errors.New("invalid cache result")
	}
	if len(text) > 4194304 || !json.Valid([]byte(text)) {
		return nil, nil
	}
	return json.RawMessage(text), nil
}
func (u *UpstashRemote) Set(ctx context.Context, key string, value json.RawMessage, ttl time.Duration) error {
	if len(value) > 4194304 || !json.Valid(value) || ttl <= 0 {
		return errors.New("invalid remote cache value")
	}
	if ttl > 24*time.Hour {
		ttl = 24 * time.Hour
	}
	millis := ttl.Milliseconds()
	if millis < 1 {
		millis = 1
	}
	result, e := u.command(ctx, []any{"SET", u.key(key), string(value), "PX", millis})
	if e != nil {
		return e
	}
	if string(result) != `"OK"` {
		return errors.New("cache write unacknowledged")
	}
	return nil
}
func (u *UpstashRemote) Epoch(ctx context.Context, group string) (string, error) {
	result, e := u.command(ctx, []any{"GET", u.key("generation:" + group)})
	if e != nil {
		return "", e
	}
	if string(result) == "null" {
		return "0", nil
	}
	var text string
	if json.Unmarshal(result, &text) != nil || !epochPattern.MatchString(text) {
		return "", errors.New("invalid cache generation")
	}
	return text, nil
}
func (u *UpstashRemote) Bump(ctx context.Context, group string) error {
	result, e := u.command(ctx, []any{"INCR", u.key("generation:" + group)})
	if e != nil {
		return e
	}
	if _, e = strconv.ParseUint(string(result), 10, 64); e != nil {
		return errors.New("cache invalidation unacknowledged")
	}
	return nil
}
func (u *UpstashRemote) Close() error { u.client.CloseIdleConnections(); return nil }
