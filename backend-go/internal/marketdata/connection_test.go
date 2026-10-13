package marketdata

import (
	"github.com/jackc/pgx/v5"
	"testing"
	"time"
)

func TestNativeDatabaseConfigurationDoesNotDependOnSessionPreparedState(t *testing.T) {
	config, e := nativeConnectionConfig("postgresql://fixture:fixture@127.0.0.1:1/fixture")
	if e != nil || config.DefaultQueryExecMode != pgx.QueryExecModeSimpleProtocol || config.ConnectTimeout != 10*time.Second {
		t.Fatal("transaction pool compatibility missing")
	}
}
