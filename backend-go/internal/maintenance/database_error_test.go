package maintenance

import (
	"context"
	"crypto/x509"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5/pgconn"
	"testing"
)

func TestDatabaseDiagnosticsNeverExposeDriverCredentials(t *testing.T) {
	for _, test := range []struct {
		err  error
		code string
	}{
		{context.DeadlineExceeded, "database_timeout"},
		{context.Canceled, "database_cancelled"},
		{x509.UnknownAuthorityError{}, "database_tls_unknown_authority"},
		{x509.HostnameError{}, "database_tls_hostname_mismatch"},
		{&pgconn.PgError{Code: "42P01", Message: "password=private user=private"}, "postgres_42P01"},
		{errors.New("postgres://private:private@private"), "database_unavailable"},
	} {
		if actual := SafeDatabaseCode(fmt.Errorf("private connection: %w", test.err)); actual != test.code {
			t.Fatal(actual, test.code)
		}
	}
}
