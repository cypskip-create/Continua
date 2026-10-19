package objectstore

import (
	"context"
	"encoding/json"
	"os"
	"testing"
	"time"
)

// Explicit opt-in, read-only verification against one small owned prepared
// object. Never enumerates a bucket, uploads data or uses DATABASE_URL.
func TestOwnedPreparedObjectReadOnly(t *testing.T) {
	raw := os.Getenv("NATIVE_OWNED_R2_READ_ONLY_RECEIPT")
	if raw == "" {
		t.Skip("One owned prepared-object read is not configured")
	}
	var receipt Receipt
	if json.Unmarshal([]byte(raw), &receipt) != nil || receipt.SecurityID != "NSE:CGEN" || receipt.Size > 65536 {
		t.Fatal("refusing unbounded or unrelated owned-object verification")
	}
	if _, err := ObjectKey(receipt); err != nil {
		t.Fatal("invalid owned prepared receipt")
	}
	reader, mode, err := FromEnvironment(os.Getenv)
	if err != nil || reader == nil || mode != "r2" {
		t.Fatal("owned private read is not configured")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	payload, err := reader.Read(ctx, receipt)
	if err != nil || !json.Valid(payload) {
		t.Fatal("owned prepared-object verification failed")
	}
	if _, err = reader.Read(ctx, receipt); err != nil {
		t.Fatal("owned immutable cache read failed")
	}
	receipt.SecurityID = "NSE:COOP"
	if _, err = reader.Read(ctx, receipt); err == nil {
		t.Fatal("cached object crossed issuer identity")
	}
}
