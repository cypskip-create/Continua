package marketdata

import (
	"crypto/tls"
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

func TestRemoteDatabaseCannotDowngradeOrSkipCertificateVerification(t *testing.T) {
	if _, e := nativeConnectionConfig("postgresql://fixture:fixture@db.fixture.example/fixture?sslmode=disable"); e == nil {
		t.Fatal("plaintext remote database accepted")
	}
	config, e := nativeConnectionConfig("postgresql://fixture:fixture@db.fixture.example/fixture?sslmode=prefer")
	if e != nil || config.TLSConfig == nil || config.TLSConfig.InsecureSkipVerify || config.TLSConfig.ServerName != "db.fixture.example" || config.TLSConfig.MinVersion < tls.VersionTLS12 {
		t.Fatal("remote TLS verification missing", e)
	}
	for _, f := range config.Fallbacks {
		if f.TLSConfig == nil || f.TLSConfig.InsecureSkipVerify {
			t.Fatal("plaintext/unverified fallback retained")
		}
	}
}
