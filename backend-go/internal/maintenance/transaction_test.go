package maintenance

import (
	"context"
	"github.com/DATA-DOG/go-sqlmock"
	"testing"
)

func TestValidationRollsBackAndApplyRequiresProtection(t *testing.T) {
	for _, tc := range []struct{ apply, passed bool }{{false, true}, {true, true}, {true, false}} {
		db, mock, err := sqlmock.New()
		if err != nil {
			t.Fatal(err)
		}
		migration := Migration{Version: "20261012220000", Name: "fixture", SQL: "SELECT 1;", SHA256: "fixture", StatementCount: 1}
		mock.ExpectBegin()
		mock.ExpectExec("SELECT pg_advisory_xact_lock").WillReturnResult(sqlmock.NewResult(0, 1))
		mock.ExpectQuery("SELECT name FROM supabase_migrations.schema_migrations").WithArgs(migration.Version).WillReturnRows(sqlmock.NewRows([]string{"name"}))
		mock.ExpectExec("SELECT 1;").WillReturnResult(sqlmock.NewResult(0, 1))
		mock.ExpectExec("INSERT INTO supabase_migrations.schema_migrations").WithArgs(migration.Version, migration.Name, sqlmock.AnyArg()).WillReturnResult(sqlmock.NewResult(0, 1))
		mock.ExpectQuery("SELECT fixture_private").WillReturnRows(sqlmock.NewRows([]string{"private"}).AddRow(tc.passed))
		if tc.apply && tc.passed {
			mock.ExpectCommit()
		} else {
			mock.ExpectRollback()
		}
		result, err := ApplyMigration(context.Background(), db, migration, tc.apply, []string{"SELECT fixture_private"})
		if (err == nil) != tc.passed || result.Applied != (tc.apply && tc.passed) || result.Validated != tc.passed {
			t.Fatalf("result %+v error %v", result, err)
		}
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Fatal(err)
		}
		db.Close()
	}
}

func TestUnknownProtectionWorkflowFailsClosed(t *testing.T) {
	if _, err := ProtectionChecks("unregistered"); err == nil {
		t.Fatal("unknown apply workflow accepted")
	}
	for _, version := range []string{"20261012220000", "20261012020000", "20261011110000", "20261011100000", "20261011123000", "20261013090000"} {
		checks, err := ProtectionChecks(version)
		if err != nil || len(checks) == 0 {
			t.Fatalf("missing postconditions %s", version)
		}
	}
}

func TestMigrationCannotRunWithoutPostconditions(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := ApplyMigration(context.Background(), db, Migration{}, true, nil); err == nil {
		t.Fatal("unguarded mutation accepted")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
