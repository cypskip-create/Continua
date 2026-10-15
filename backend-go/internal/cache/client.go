package cache

import (
	"context"
	"encoding/json"
	"time"
)

type Client interface {
	Get(string) json.RawMessage
	Set(string, json.RawMessage, time.Duration)
	Delete(string)
	DeletePrefix(string)
	GetOrLoad(context.Context, string, time.Duration, func(context.Context) (json.RawMessage, error)) (json.RawMessage, error)
}
