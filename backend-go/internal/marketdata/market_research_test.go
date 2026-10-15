package marketdata

import (
	"context"
	"github.com/DATA-DOG/go-sqlmock"
	"github.com/jackc/pgx/v5/pgconn"
	"testing"
)

func TestMissingResearchMigrationIsCoverageButOtherFailuresAreNot(t *testing.T) {
	s, m := mockStore(t)
	m.ExpectQuery(`SELECT row_to_json.*verified_at IS NOT NULL`).WillReturnError(&pgconn.PgError{Code: "42P01"})
	raw, err := s.ResearchRecords(context.Background())
	if err != nil || string(raw) != `{"records":[],"available":false}` {
		t.Fatal(string(raw), err)
	}
	m.ExpectQuery(`SELECT row_to_json.*verified_at IS NOT NULL`).WillReturnError(&pgconn.PgError{Code: "42501"})
	if _, err := s.ResearchRecords(context.Background()); err == nil {
		t.Fatal("permission failure hidden as no coverage")
	}
	m.ExpectQuery(`SELECT row_to_json.*verified_at IS NOT NULL`).WillReturnRows(sqlmock.NewRows([]string{"row"}))
	raw, err = s.ResearchRecords(context.Background())
	if err != nil || string(raw) != `{"available":true,"records":[]}` {
		t.Fatal(string(raw), err)
	}
}
