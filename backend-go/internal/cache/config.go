package cache

import (
	"errors"
)

func FromEnvironment(get func(string) string, allowLoopback bool) (Client, func() error, error) {
	driver := get("CACHE_DRIVER")
	if driver == "" || driver == "memory" {
		return NewMemory(), func() error { return nil }, nil
	}
	namespace := get("CACHE_NAMESPACE")
	if namespace == "" {
		namespace = "continua"
	}
	var remote Remote
	var e error
	switch driver {
	case "redis":
		remote, e = NewRedisRemote(get("REDIS_URL"), namespace, allowLoopback)
	case "upstash":
		remote, e = NewUpstashRemote(get("UPSTASH_REDIS_REST_URL"), get("UPSTASH_REDIS_REST_TOKEN"), namespace)
	default:
		return nil, nil, errors.New("invalid native cache driver")
	}
	if e != nil {
		return nil, nil, e
	}
	client := NewDistributed(remote)
	return client, client.Close, nil
}
