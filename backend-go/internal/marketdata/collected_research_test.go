package marketdata

import (
	"context"
	"continua/backend/internal/objectstore"
	"encoding/json"
	"github.com/DATA-DOG/go-sqlmock"
	"strings"
	"testing"
)

type preparedFixture struct{ calls int }

func (f *preparedFixture) Read(_ context.Context, r objectstore.Receipt) (json.RawMessage, error) {
	f.calls++
	return json.RawMessage(`{"revenue":123.456,"eps":null}`), nil
}

func TestCollectedProjectionRequiresItsPrivateReader(t *testing.T) {
	store, m := mockStore(t)
	m.ExpectQuery(`SELECT payload FROM`).WithArgs("NSE:KCB", 20, 0).WillReturnRows(sqlmock.NewRows([]string{"payload"}).AddRow(`{"cloudPayload":true,"tableCount":5}`))
	if _, err := store.CollectedResearch(context.Background(), "KCB", 20, 0); err == nil || !strings.Contains(err.Error(), "cloud payload reader") {
		t.Fatal("internal projection reached public response", err)
	}
}

func TestCollectedCloudReadRetainsCurrentRightsGateAndHydratesFullPresentation(t *testing.T) {
	store, m := mockStore(t)
	reader := &preparedFixture{}
	store.ProcessedObjects = reader
	store.ProcessedStorageMode = "r2"
	m.ExpectQuery(`SELECT jsonb_build_object.*s.redistribution_allowed=true`).WithArgs("NSE:KCB", 20, 0).WillReturnRows(sqlmock.NewRows([]string{"payload"}).AddRow(`{"payload":{"cloudPayload":true},"receipt":{"object_uri":"private-fixture","extraction_id":7}}`))
	result, err := store.CollectedResearch(context.Background(), "KCB", 20, 0)
	if err != nil || len(result) != 1 || reader.calls != 1 || string(result[0]) != `{"revenue":123.456,"eps":null}` {
		t.Fatal(result, err)
	}
}
