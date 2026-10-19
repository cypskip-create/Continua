package marketdata

import (
	"context"
	"errors"
	"github.com/DATA-DOG/go-sqlmock"
	"testing"
)

func TestRegistryRefreshUsesActiveUniverseAndRetainsLease(t *testing.T) {
	store, m := mockStore(t)
	if _, err := store.QueueRegistryRefresh(context.Background(), "OTHER"); err == nil {
		t.Fatal("unsupported registry accepted")
	}
	m.ExpectExec(`INSERT INTO market.native_research_refresh.*SELECT id,symbol FROM market.securities WHERE exchange=\$1 AND status<>'delisted'.*requested_version=market.native_research_refresh.requested_version\+1`).WithArgs("NSE").WillReturnResult(sqlmock.NewResult(0, 69))
	n, err := store.QueueRegistryRefresh(context.Background(), "NSE")
	if err != nil || n != 69 {
		t.Fatal(n, err)
	}
	m.ExpectExec(`INSERT INTO market.native_research_refresh`).WithArgs("NSE").WillReturnError(errors.New("fixture unavailable"))
	if _, err = store.QueueRegistryRefresh(context.Background(), "NSE"); err == nil {
		t.Fatal("failed enqueue claimed success")
	}
}
