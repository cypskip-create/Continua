// Package objectstore reads prepared private objects; it never exposes originals.
package objectstore

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

const maxBytes = 8 * 1024 * 1024
const bucket = "continua-financial-documents"

var locationPattern = regexp.MustCompile(`^r2://continua-financial-documents/processed/research/[a-zA-Z0-9_-]{1,100}/[1-9][0-9]*/[a-f0-9]{64}\.json\.gz$`)

type Receipt struct {
	ObjectURI    string `json:"object_uri"`
	Hash         string `json:"sha256"`
	Size         int64  `json:"size_bytes"`
	ExtractionID int64  `json:"extraction_id"`
	Version      string `json:"processor_version"`
	SecurityID   string `json:"security_id"`
	Destination  string `json:"destination"`
	Status       string `json:"status"`
}

func ObjectKey(r Receipt) (string, error) {
	if !locationPattern.MatchString(r.ObjectURI) || !strings.HasSuffix(r.ObjectURI, "/"+r.Hash+".json.gz") || len(r.Hash) != 64 || r.Size < 1 || r.Size > maxBytes {
		return "", errors.New("invalid processed object receipt")
	}
	return strings.TrimPrefix(r.ObjectURI, "r2://"+bucket+"/"), nil
}

func Decode(body []byte, r Receipt) (json.RawMessage, error) {
	if _, err := ObjectKey(r); err != nil {
		return nil, err
	}
	hash := sha256.Sum256(body)
	if int64(len(body)) != r.Size || hex.EncodeToString(hash[:]) != r.Hash {
		return nil, errors.New("processed object integrity mismatch")
	}
	reader, err := gzip.NewReader(bytes.NewReader(body))
	if err != nil {
		return nil, errors.New("invalid processed gzip")
	}
	defer reader.Close()
	decoded, err := io.ReadAll(io.LimitReader(reader, maxBytes+8192+1))
	if err != nil || len(decoded) > maxBytes+8192 {
		return nil, errors.New("processed object decoded limit exceeded")
	}
	var value struct {
		SchemaVersion int             `json:"schemaVersion"`
		Kind          string          `json:"kind"`
		ExtractionID  int64           `json:"extractionId"`
		Version       string          `json:"processorVersion"`
		SecurityID    string          `json:"securityId"`
		Destination   string          `json:"destination"`
		Status        string          `json:"status"`
		Payload       json.RawMessage `json:"payload"`
	}
	if json.Unmarshal(decoded, &value) != nil || value.SchemaVersion != 1 || value.Kind != "processed-research" ||
		value.ExtractionID != r.ExtractionID || value.Version != r.Version || value.SecurityID != r.SecurityID ||
		value.Destination != r.Destination || value.Status != r.Status || len(value.Payload) == 0 || len(value.Payload) > maxBytes || value.Payload[0] != '{' {
		return nil, errors.New("processed object identity mismatch")
	}
	return value.Payload, nil
}

type objectClient interface {
	GetObject(context.Context, *s3.GetObjectInput, ...func(*s3.Options)) (*s3.GetObjectOutput, error)
}
type cached struct {
	body    []byte
	expires time.Time
}
type Reader struct {
	client objectClient
	slots  chan struct{}
	mu     sync.Mutex
	cache  map[string]cached
	size   int
}

func FromEnvironment(getenv func(string) string) (*Reader, string, error) {
	mode := getenv("PROCESSED_STORAGE_READS")
	if mode == "" || mode == "database" {
		return nil, "database", nil
	}
	if mode != "prefer-r2" && mode != "r2" {
		return nil, "", errors.New("invalid processed storage mode")
	}
	account, key, secret := getenv("R2_ACCOUNT_ID"), getenv("R2_ACCESS_KEY_ID"), getenv("R2_SECRET_ACCESS_KEY")
	if account != "de867ecc0ef417877b8d4ef9580c4fe7" || key == "" || secret == "" {
		return nil, "", errors.New("private processed storage is not configured")
	}
	client := s3.NewFromConfig(aws.Config{Region: "auto", Credentials: credentials.NewStaticCredentialsProvider(key, secret, ""),
		HTTPClient: &http.Client{Timeout: 12 * time.Second}, RetryMaxAttempts: 2}, func(o *s3.Options) {
		o.BaseEndpoint = aws.String("https://" + account + ".r2.cloudflarestorage.com")
		o.UsePathStyle = true
	})
	return &Reader{client: client, slots: make(chan struct{}, 4), cache: map[string]cached{}}, mode, nil
}

func (r *Reader) Read(ctx context.Context, receipt Receipt) (json.RawMessage, error) {
	key, err := ObjectKey(receipt)
	if err != nil {
		return nil, err
	}
	r.mu.Lock()
	entry, hit := r.cache[key]
	r.mu.Unlock()
	if hit && time.Now().Before(entry.expires) {
		return Decode(entry.body, receipt)
	}
	select {
	case r.slots <- struct{}{}:
		defer func() { <-r.slots }()
	default:
		return nil, errors.New("processed storage capacity unavailable")
	}
	ctx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()
	result, err := r.client.GetObject(ctx, &s3.GetObjectInput{Bucket: aws.String(bucket), Key: aws.String(key)})
	if err != nil {
		return nil, errors.New("private processed object unavailable")
	}
	if result.Body == nil {
		return nil, errors.New("processed object body unavailable")
	}
	defer result.Body.Close()
	if aws.ToInt64(result.ContentLength) != receipt.Size {
		return nil, errors.New("processed object size mismatch")
	}
	body, err := io.ReadAll(io.LimitReader(result.Body, receipt.Size+1))
	if err != nil {
		return nil, errors.New("processed object read failed")
	}
	payload, err := Decode(body, receipt)
	if err != nil {
		return nil, err
	}
	r.mu.Lock()
	if len(r.cache) >= 128 || r.size+len(body) > 32*1024*1024 {
		r.cache = map[string]cached{}
		r.size = 0
	}
	if old, exists := r.cache[key]; exists {
		r.size -= len(old.body)
	}
	r.cache[key] = cached{body: body, expires: time.Now().Add(10 * time.Minute)}
	r.size += len(body)
	r.mu.Unlock()
	return payload, nil
}
