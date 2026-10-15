package marketdata

import (
	"crypto/x509"
	_ "embed"
	"errors"
	"strings"
)

// Public CA, obtained from the certificate URL in Supabase's official dashboard
// source. Trust is scoped to Supabase database hosts, never arbitrary origins.
// DER SHA256: 807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa.
//
//go:embed supabase-root-2021.crt
var supabaseRoot []byte

func supabaseDatabaseHost(host string) bool {
	return strings.HasSuffix(host, ".pooler.supabase.com") ||
		(strings.HasPrefix(host, "db.") && strings.HasSuffix(host, ".supabase.co"))
}

func databaseRoots(host string, existing *x509.CertPool) (*x509.CertPool, error) {
	if !supabaseDatabaseHost(host) || existing != nil {
		return existing, nil
	}
	roots, err := x509.SystemCertPool()
	if err != nil {
		roots = x509.NewCertPool()
	}
	if !roots.AppendCertsFromPEM(supabaseRoot) {
		return nil, errors.New("Invalid bundled database CA")
	}
	return roots, nil
}
