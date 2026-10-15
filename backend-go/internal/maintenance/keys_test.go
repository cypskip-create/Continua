package maintenance

import (
	"context"
	"continua/backend/internal/auth"
	"database/sql/driver"
	"encoding/hex"
	"github.com/DATA-DOG/go-sqlmock"
	"strings"
	"testing"
)

type storedKeyHash struct{ value *string }

func (m storedKeyHash) Match(v driver.Value) bool {
	s, ok := v.(string)
	if !ok || len(s) != 64 {
		return false
	}
	if _, err := hex.DecodeString(s); err != nil {
		return false
	}
	*m.value = s
	return true
}

func TestKeyCreationPersistsOnlyCompatibleHash(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var stored string
	mock.ExpectQuery(`INSERT INTO market.api_keys`).WithArgs(storedKeyHash{&stored}, "Fixture key", 120).WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("12345678-1234-1234-1234-123456789abc"))
	result, err := CreateKey(context.Background(), db, "Fixture key", 120)
	if err != nil || !strings.HasPrefix(result.PlaintextKey, "afk_") || len(result.PlaintextKey) != 52 {
		t.Fatal("native key creation failed")
	}
	expected, err := auth.HashKey(result.PlaintextKey)
	if err != nil || expected != stored {
		t.Fatal("legacy-compatible hash not stored")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
func TestKeyValidationAndRevocationAreExact(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, name := range []string{"", " padded", "line\nbreak", strings.Repeat("x", 201)} {
		if _, err := CreateKey(context.Background(), db, name, 120); err == nil {
			t.Fatal("invalid name accepted")
		}
	}
	if _, err := CreateKey(context.Background(), db, "Fixture", 0); err == nil {
		t.Fatal("invalid rate accepted")
	}
	if err := RevokeKey(context.Background(), db, "all"); err == nil {
		t.Fatal("broad revocation accepted")
	}
	id := "12345678-1234-1234-1234-123456789abc"
	mock.ExpectExec(`UPDATE market.api_keys SET active=false WHERE id=\$1`).WithArgs(id).WillReturnResult(sqlmock.NewResult(0, 1))
	if err := RevokeKey(context.Background(), db, id); err != nil {
		t.Fatal(err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
