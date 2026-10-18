package cache

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"
)

// RateCounter is deliberately separate from cache reads: a cache miss or an
// outage must never reset an access-control counter or silently fail open.
type RateCounter interface {
	Take(context.Context, string, int, time.Duration) (bool, time.Duration, error)
}

const rateScript = `local ttl=redis.call('PTTL',KEYS[1]);
 if ttl<0 then redis.call('SET',KEYS[1],0,'PX',ARGV[2]); ttl=tonumber(ARGV[2]); end;
 local count=tonumber(redis.call('GET',KEYS[1]));
 if count>=tonumber(ARGV[1]) then return {0,ttl}; end;
 redis.call('INCR',KEYS[1]); return {1,ttl};`

func rateKey(key string, limit int, window time.Duration) (string, error) {
	if key == "" || len(key) > 1024 || limit < 1 || limit > 100000 || window < time.Millisecond || window > time.Hour {
		return "", errors.New("invalid rate policy")
	}
	sum := sha256.Sum256([]byte(key))
	return "rate:" + hex.EncodeToString(sum[:]), nil
}
func rateResult(result []int64) (bool, time.Duration, error) {
	if len(result) != 2 || (result[0] != 0 && result[0] != 1) || result[1] < 0 || result[1] > 3600000 {
		return false, 0, errors.New("invalid rate counter response")
	}
	return result[0] == 1, time.Duration(result[1]) * time.Millisecond, nil
}
func (r *RedisRemote) Take(ctx context.Context, key string, limit int, window time.Duration) (bool, time.Duration, error) {
	key, err := rateKey(key, limit, window)
	if err != nil {
		return false, 0, err
	}
	result, err := r.client.Eval(ctx, rateScript, []string{r.key(key)}, limit, window.Milliseconds()).Int64Slice()
	if err != nil {
		return false, 0, errors.New("rate counter unavailable")
	}
	return rateResult(result)
}
func (u *UpstashRemote) Take(ctx context.Context, key string, limit int, window time.Duration) (bool, time.Duration, error) {
	key, err := rateKey(key, limit, window)
	if err != nil {
		return false, 0, err
	}
	raw, err := u.command(ctx, []any{"EVAL", rateScript, 1, u.namespace + ":" + key, limit, window.Milliseconds()})
	if err != nil {
		return false, 0, errors.New("rate counter unavailable")
	}
	var result []int64
	if json.Unmarshal(raw, &result) != nil {
		return false, 0, errors.New("invalid rate counter response")
	}
	return rateResult(result)
}
func (d *Distributed) Take(ctx context.Context, key string, limit int, window time.Duration) (bool, time.Duration, error) {
	remote, ok := d.remote.(RateCounter)
	if !ok {
		return false, 0, errors.New("distributed rate counter is not configured")
	}
	return remote.Take(ctx, key, limit, window)
}
