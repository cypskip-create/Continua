package marketdata

import (
	"crypto/sha256"
	"crypto/x509"
	"encoding/hex"
	"encoding/pem"
	"testing"
)

func TestBundledSupabaseRootIsPinnedAndHostScoped(t *testing.T) {
	block, rest := pem.Decode(supabaseRoot)
	if block == nil || len(rest) != 0 {
		t.Fatal("invalid root bundle")
	}
	certificate, err := x509.ParseCertificate(block.Bytes)
	if err != nil || !certificate.IsCA || certificate.CheckSignatureFrom(certificate) != nil {
		t.Fatal("invalid CA")
	}
	sum := sha256.Sum256(certificate.Raw)
	if hex.EncodeToString(sum[:]) != "807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa" {
		t.Fatal("unreviewed CA rotation")
	}
	for _, host := range []string{"aws-1-eu-west-2.pooler.supabase.com", "db.fixture.supabase.co"} {
		roots, e := databaseRoots(host, nil)
		if e != nil || roots == nil {
			t.Fatal("missing provider root")
		}
	}
	for _, host := range []string{"fixture.example", "pooler.supabase.com.attacker.example", "db.fixture.supabase.co.attacker.example", "attacker-supabase.co"} {
		roots, e := databaseRoots(host, nil)
		if e != nil || roots != nil {
			t.Fatal("provider CA escaped hostname boundary")
		}
	}
	explicit := x509.NewCertPool()
	got, err := databaseRoots("aws-1-eu-west-2.pooler.supabase.com", explicit)
	if err != nil || got != explicit {
		t.Fatal("explicit operator trust was replaced")
	}
}
