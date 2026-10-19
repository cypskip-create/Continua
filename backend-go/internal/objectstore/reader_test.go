package objectstore

import (
	"bytes"
	"context"
	"errors"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"io"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type clientFixture struct {
	get func(context.Context, *s3.GetObjectInput) (*s3.GetObjectOutput, error)
}

func (f clientFixture) GetObject(ctx context.Context, in *s3.GetObjectInput, _ ...func(*s3.Options)) (*s3.GetObjectOutput, error) {
	return f.get(ctx, in)
}

type trackedBody struct {
	io.Reader
	closed *atomic.Int32
}

func (b trackedBody) Close() error { b.closed.Add(1); return nil }
func testReader(client objectClient) *Reader {
	return &Reader{client: client, slots: make(chan struct{}, 4), cache: map[string]cached{}}
}

func TestImmutableCacheStillChecksIdentityAndClosesBodies(t *testing.T) {
	body, receipt := fixture(t, `{"eps":null}`)
	var calls, closed atomic.Int32
	reader := testReader(clientFixture{get: func(ctx context.Context, in *s3.GetObjectInput) (*s3.GetObjectOutput, error) {
		calls.Add(1)
		if aws.ToString(in.Bucket) != bucket {
			t.Error("unexpected bucket")
		}
		return &s3.GetObjectOutput{Body: trackedBody{bytes.NewReader(body), &closed}, ContentLength: aws.Int64(int64(len(body)))}, nil
	}})
	for i := 0; i < 2; i++ {
		if _, err := reader.Read(context.Background(), receipt); err != nil {
			t.Fatal(err)
		}
	}
	receipt.SecurityID = "NSE:COOP"
	if _, err := reader.Read(context.Background(), receipt); err == nil {
		t.Fatal("cached cross-company response accepted")
	}
	if calls.Load() != 1 || closed.Load() != 1 {
		t.Fatal("immutable cache or body cleanup failed", calls.Load(), closed.Load())
	}
}

func TestPrivateReadConcurrencyIsBoundedAndProviderErrorsStayPrivate(t *testing.T) {
	_, receipt := fixture(t, `{}`)
	entered, release := make(chan struct{}, 4), make(chan struct{})
	reader := testReader(clientFixture{get: func(ctx context.Context, _ *s3.GetObjectInput) (*s3.GetObjectOutput, error) {
		entered <- struct{}{}
		select {
		case <-release:
		case <-ctx.Done():
		}
		return nil, errors.New("private provider credential")
	}})
	var group sync.WaitGroup
	for i := 0; i < 4; i++ {
		group.Add(1)
		go func() {
			defer group.Done()
			_, err := reader.Read(context.Background(), receipt)
			if err == nil || strings.Contains(err.Error(), "credential") {
				t.Error("private provider detail escaped")
			}
		}()
	}
	for i := 0; i < 4; i++ {
		select {
		case <-entered:
		case <-time.After(time.Second):
			t.Fatal("bounded workers did not start")
		}
	}
	if _, err := reader.Read(context.Background(), receipt); err == nil || !strings.Contains(err.Error(), "capacity") {
		t.Fatal("fifth read bypassed capacity")
	}
	close(release)
	group.Wait()
	if len(reader.slots) != 0 {
		t.Fatal("failed requests leaked admission slots")
	}
}

func TestFailedSizeAndIntegrityReadsNeverEnterCache(t *testing.T) {
	body, receipt := fixture(t, `{}`)
	for _, size := range []int64{int64(len(body) - 1), int64(len(body))} {
		var closed atomic.Int32
		corrupt := append([]byte(nil), body...)
		corrupt[0] ^= 1
		reader := testReader(clientFixture{get: func(context.Context, *s3.GetObjectInput) (*s3.GetObjectOutput, error) {
			return &s3.GetObjectOutput{Body: trackedBody{bytes.NewReader(corrupt), &closed}, ContentLength: aws.Int64(size)}, nil
		}})
		if _, err := reader.Read(context.Background(), receipt); err == nil {
			t.Fatal("corrupt object accepted")
		}
		if closed.Load() != 1 || len(reader.cache) != 0 || len(reader.slots) != 0 {
			t.Fatal("failed read leaked body, cache or slot")
		}
	}
}
