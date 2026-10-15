package cache

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"github.com/redis/go-redis/v9"
	"net/url"
	"time"
)

type RedisRemote struct {
	client    *redis.Client
	namespace string
}

func NewRedisRemote(origin, namespace string, allowLoopback bool) (*RedisRemote, error) {
	u, e := url.Parse(origin)
	if e != nil || u.Hostname() == "" || u.RawQuery != "" || u.Fragment != "" || !namespacePattern.MatchString(namespace) {
		return nil, errors.New("invalid Redis cache configuration")
	}
	local := u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1" || u.Hostname() == "::1"
	if u.Scheme != "rediss" && !(u.Scheme == "redis" && local && allowLoopback) {
		return nil, errors.New("Redis requires verified TLS outside local fixtures")
	}
	options, e := redis.ParseURL(origin)
	if e != nil {
		return nil, errors.New("invalid Redis cache configuration")
	}
	options.PoolSize = 2
	options.MaxActiveConns = 2
	options.MaxConcurrentDials = 2
	options.MaxIdleConns = 2
	options.MinIdleConns = 0
	options.PipelinePoolSize = -1
	options.MaxRetries = -1
	options.DialTimeout = 500 * time.Millisecond
	options.ReadTimeout = 750 * time.Millisecond
	options.WriteTimeout = 750 * time.Millisecond
	options.PoolTimeout = 250 * time.Millisecond
	options.ContextTimeoutEnabled = true
	options.ReadBufferSize = 16 * 1024
	options.WriteBufferSize = 16 * 1024
	options.Protocol = 2
	options.DisableIdentity = true
	if options.TLSConfig != nil {
		options.TLSConfig = &tls.Config{MinVersion: tls.VersionTLS12, ServerName: u.Hostname()}
	}
	return &RedisRemote{client: redis.NewClient(options), namespace: namespace}, nil
}
func (r *RedisRemote) key(key string) string { return r.namespace + ":" + key }
func (r *RedisRemote) Get(ctx context.Context, key string) (json.RawMessage, error) {
	// Bound a legacy/foreign value on the server before the SDK allocates its bulk
	// reply. Cache values are strings; other types are never decoded as evidence.
	raw, e := r.client.Eval(ctx, `if redis.call('TYPE',KEYS[1]).ok ~= 'string' then return false end; if redis.call('STRLEN',KEYS[1]) > 4194304 then return false end; return redis.call('GET',KEYS[1])`, []string{r.key(key)}).Text()
	if e == redis.Nil {
		return nil, nil
	}
	if e != nil {
		return nil, errors.New("Redis cache read unavailable")
	}
	if len(raw) > 4194304 || !json.Valid([]byte(raw)) {
		return nil, nil
	}
	return json.RawMessage(raw), nil
}
func (r *RedisRemote) Set(ctx context.Context, key string, value json.RawMessage, ttl time.Duration) error {
	if len(value) > 4194304 || !json.Valid(value) || ttl <= 0 {
		return errors.New("invalid remote cache value")
	}
	if ttl > 24*time.Hour {
		ttl = 24 * time.Hour
	}
	if ttl < time.Millisecond {
		ttl = time.Millisecond
	}
	if e := r.client.Set(ctx, r.key(key), string(value), ttl).Err(); e != nil {
		return errors.New("Redis cache write unavailable")
	}
	return nil
}
func (r *RedisRemote) Epoch(ctx context.Context, group string) (string, error) {
	value, e := r.client.Get(ctx, r.key("generation:"+group)).Result()
	if e == redis.Nil {
		return "0", nil
	}
	if e != nil || !epochPattern.MatchString(value) {
		return "", errors.New("Redis cache generation unavailable")
	}
	return value, nil
}
func (r *RedisRemote) Bump(ctx context.Context, group string) error {
	if e := r.client.Incr(ctx, r.key("generation:"+group)).Err(); e != nil {
		return errors.New("Redis cache invalidation unavailable")
	}
	return nil
}
func (r *RedisRemote) Close() error { return r.client.Close() }
