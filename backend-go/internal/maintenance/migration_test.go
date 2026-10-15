package maintenance

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAtomicMigrationPreservesQuotedBodies(t *testing.T) {
	raw := `-- trusted migration
BEGIN;
CREATE FUNCTION fixture() RETURNS void LANGUAGE plpgsql AS $body$
BEGIN
 PERFORM ';ROLLBACK;'; /* nested /* comment */ safe */
END;
$body$;
INSERT INTO fixture_log VALUES ('a;''b', E'escaped\\value;');
COMMIT; -- trailing comment
`
	body, count, err := AtomicSQL(raw)
	if err != nil || count != 2 || !strings.Contains(body, "PERFORM ';ROLLBACK;'") {
		t.Fatalf("body parsing: %d %v", count, err)
	}
}

func TestAtomicMigrationRejectsTransactionEscape(t *testing.T) {
	for _, raw := range []string{
		"SELECT 1; COMMIT; SELECT 2;", "BEGIN; SELECT 1; ROLLBACK; COMMIT;",
		"START TRANSACTION; SELECT 1;", "SAVEPOINT unsafe;", "END;", "ABORT;", "PREPARE TRANSACTION 'unsafe';",
		"SELECT 1; COMMIT/**/; SELECT 2;", "START/* nested /* comment */ safe */TRANSACTION;", "PREPARE-- comment\nTRANSACTION 'unsafe';", "CREATE/* comment */INDEX/* comment */CONCURRENTLY x ON fixture(id);",
		"CREATE INDEX CONCURRENTLY x ON fixture(id);", "DROP INDEX CONCURRENTLY x;",
		"SELECT 'unterminated", "SELECT $tag$unterminated", "/* unterminated", "-- empty",
	} {
		if _, _, err := AtomicSQL(raw); err == nil {
			t.Errorf("accepted unsafe SQL: %q", raw)
		}
	}
}

func TestReadMigrationIsBoundedRepositoryOnlyAndOffline(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "backend", "migration")
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "20261013090000 fixture.sql")
	if err := os.WriteFile(path, []byte("BEGIN; SELECT 1; COMMIT;"), 0600); err != nil {
		t.Fatal(err)
	}
	m, err := ReadMigration(root, "backend/migration/20261013090000 fixture.sql")
	if err != nil || m.Version != "20261013090000" || m.Name != "fixture" || len(m.SHA256) != 64 || m.StatementCount != 1 {
		t.Fatalf("plan: %+v %v", m, err)
	}
	for _, path := range []string{"../outside.sql", "backend/migration/../../../outside.sql", "README.md", "backend/migration/not-versioned.sql"} {
		if _, err := ReadMigration(root, path); err == nil {
			t.Errorf("accepted path %q", path)
		}
	}
	if err := os.WriteFile(path, []byte("SELECT 1;\x00"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := ReadMigration(root, "backend/migration/20261013090000 fixture.sql"); err == nil {
		t.Fatal("accepted NUL")
	}
}
