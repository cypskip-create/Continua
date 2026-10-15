package maintenance

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"github.com/jackc/pgx/v5/pgconn"
	"net"
	"regexp"
)

// SafeDatabaseCode exposes only a fixed category or PostgreSQL SQLSTATE. Never
// return driver text: connection errors can contain usernames and host details.
func SafeDatabaseCode(err error) string {
	if errors.Is(err, context.DeadlineExceeded) {
		return "database_timeout"
	}
	if errors.Is(err, context.Canceled) {
		return "database_cancelled"
	}
	var certificate *tls.CertificateVerificationError
	var authority x509.UnknownAuthorityError
	var hostname x509.HostnameError
	if errors.As(err, &authority) {
		return "database_tls_unknown_authority"
	}
	if errors.As(err, &hostname) {
		return "database_tls_hostname_mismatch"
	}
	if errors.As(err, &certificate) {
		return "database_tls_verification_failed"
	}
	var postgres *pgconn.PgError
	if errors.As(err, &postgres) && regexp.MustCompile(`^[A-Z0-9]{5}$`).MatchString(postgres.Code) {
		return "postgres_" + postgres.Code
	}
	var network *net.OpError
	if errors.As(err, &network) {
		if network.Timeout() {
			return "database_network_timeout"
		}
		return "database_network_unavailable"
	}
	return "database_unavailable"
}
