package maintenance

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"unicode/utf8"
)

type Migration struct {
	Version, Name, Path, SHA256 string
	SQL                         string
	StatementCount              int
}
type MigrationResult struct {
	Version        string `json:"version"`
	SHA256         string `json:"sha256"`
	Applied        bool   `json:"applied"`
	AlreadyApplied bool   `json:"alreadyApplied"`
	Validated      bool   `json:"validated"`
	StatementCount int    `json:"statementCount"`
}

var migrationName = regexp.MustCompile(`^([0-9]{3,20})[ _]([A-Za-z0-9_ -]+)\.sql$`)
var dollarTag = regexp.MustCompile(`^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$`)

func ReadMigration(repo, path string) (Migration, error) {
	var result Migration
	path = filepath.ToSlash(filepath.Clean(path))
	if filepath.IsAbs(path) || strings.HasPrefix(path, "../") || (!strings.HasPrefix(path, "supabase/migrations/") && !strings.HasPrefix(path, "backend/migration/")) {
		return result, errors.New("migration must be a repository SQL file")
	}
	match := migrationName.FindStringSubmatch(filepath.Base(path))
	if match == nil {
		return result, errors.New("invalid migration filename")
	}
	root, e := os.OpenRoot(repo)
	if e != nil {
		return result, e
	}
	defer root.Close()
	file, e := root.Open(filepath.FromSlash(path))
	if e != nil {
		return result, e
	}
	defer file.Close()
	info, e := file.Stat()
	if e != nil || !info.Mode().IsRegular() || info.Size() > 4*1024*1024 {
		return result, errors.New("migration file budget")
	}
	raw, e := io.ReadAll(io.LimitReader(file, 4*1024*1024+1))
	if e != nil || len(raw) > 4*1024*1024 || !utf8.Valid(raw) || strings.ContainsRune(string(raw), 0) {
		return result, errors.New("invalid migration content")
	}
	body, count, e := AtomicSQL(string(raw))
	if e != nil {
		return result, e
	}
	sum := sha256.Sum256(raw)
	return Migration{Version: match[1], Name: strings.ReplaceAll(match[2], " ", "_"), Path: path, SHA256: hex.EncodeToString(sum[:]), SQL: body, StatementCount: count}, nil
}

// Split only top-level SQL. Function bodies, quoted semicolons and nested
// comments cannot be confused with transaction controls.
func Statements(raw string) ([]string, error) {
	statements := []string{}
	start := 0
	var quote byte
	escaped := false
	dollar := ""
	block := 0
	line := false
	for i := 0; i < len(raw); i++ {
		if line {
			if raw[i] == '\n' {
				line = false
			}
			continue
		}
		if block > 0 {
			if strings.HasPrefix(raw[i:], "/*") {
				block++
				i++
			} else if strings.HasPrefix(raw[i:], "*/") {
				block--
				i++
			}
			continue
		}
		if dollar != "" {
			if strings.HasPrefix(raw[i:], dollar) {
				i += len(dollar) - 1
				dollar = ""
			}
			continue
		}
		if quote != 0 {
			if escaped && raw[i] == '\\' {
				i++
				continue
			}
			if raw[i] == quote {
				if i+1 < len(raw) && raw[i+1] == quote {
					i++
				} else {
					quote = 0
				}
			}
			continue
		}
		if strings.HasPrefix(raw[i:], "--") {
			line = true
			i++
			continue
		}
		if strings.HasPrefix(raw[i:], "/*") {
			block = 1
			i++
			continue
		}
		if raw[i] == '\'' || raw[i] == '"' {
			quote = raw[i]
			escaped = quote == '\'' && i > 0 && (raw[i-1] == 'E' || raw[i-1] == 'e')
			continue
		}
		if raw[i] == '$' {
			if tag := dollarTag.FindString(raw[i:]); tag != "" {
				dollar = tag
				i += len(tag) - 1
				continue
			}
		}
		if raw[i] == ';' {
			if value := strings.TrimSpace(raw[start:i]); value != "" {
				statements = append(statements, value)
			}
			start = i + 1
		}
	}
	if quote != 0 || dollar != "" || block != 0 {
		return nil, errors.New("unterminated SQL literal/comment")
	}
	if value := strings.TrimSpace(raw[start:]); value != "" {
		statements = append(statements, value)
	}
	return statements, nil
}
func leadingSQL(statement string) string {
	for {
		statement = strings.TrimSpace(statement)
		if strings.HasPrefix(statement, "--") {
			at := strings.IndexByte(statement, '\n')
			if at < 0 {
				return ""
			}
			statement = statement[at+1:]
			continue
		}
		if strings.HasPrefix(statement, "/*") {
			depth := 1
			i := 2
			for ; i < len(statement) && depth > 0; i++ {
				if strings.HasPrefix(statement[i:], "/*") {
					depth++
					i++
				} else if strings.HasPrefix(statement[i:], "*/") {
					depth--
					i++
				}
			}
			if depth != 0 {
				return ""
			}
			statement = statement[i:]
			continue
		}
		return statement
	}
}
func AtomicSQL(raw string) (string, int, error) {
	items, e := Statements(raw)
	if e != nil {
		return "", 0, e
	}
	clean := []string{}
	for _, s := range items {
		if leadingSQL(s) != "" {
			clean = append(clean, s)
		}
	}
	if len(clean) >= 2 && strings.EqualFold(leadingSQL(clean[0]), "BEGIN") && strings.EqualFold(leadingSQL(clean[len(clean)-1]), "COMMIT") {
		clean = clean[1 : len(clean)-1]
	}
	for _, s := range clean {
		words := statementPrefix(s, 5)
		if len(words) == 0 {
			continue
		}
		if map[string]bool{"BEGIN": true, "COMMIT": true, "ROLLBACK": true, "ABORT": true, "SAVEPOINT": true, "RELEASE": true, "END": true}[words[0]] || ((words[0] == "START" || words[0] == "PREPARE") && len(words) > 1 && words[1] == "TRANSACTION") {
			return "", 0, errors.New("nested migration transaction control prohibited")
		}
		if len(words) > 2 && (words[0] == "CREATE" || words[0] == "DROP") && strings.Contains(strings.Join(words[:min(5, len(words))], " "), "CONCURRENTLY") {
			return "", 0, errors.New("non-atomic concurrent DDL requires separate reviewed workflow")
		}
	}
	if len(clean) == 0 {
		return "", 0, errors.New("empty migration")
	}
	return strings.Join(clean, ";\n") + ";", len(clean), nil
}

// Comments are legal between a transaction keyword and punctuation (COMMIT/**/)
// or between START and TRANSACTION; whitespace splitting would miss escapes.
func statementPrefix(raw string, limit int) []string {
	words := []string{}
	for len(words) < limit {
		raw = leadingSQL(raw)
		end := 0
		for end < len(raw) && ((raw[end] >= 'a' && raw[end] <= 'z') || (raw[end] >= 'A' && raw[end] <= 'Z') || raw[end] == '_') {
			end++
		}
		if end == 0 {
			break
		}
		words = append(words, strings.ToUpper(raw[:end]))
		raw = raw[end:]
	}
	return words
}

func ApplyMigration(ctx context.Context, db *sql.DB, m Migration, apply bool, checks []string) (MigrationResult, error) {
	result := MigrationResult{Version: m.Version, SHA256: m.SHA256, StatementCount: m.StatementCount}
	if len(checks) == 0 {
		return result, errors.New("migration protection checks are required")
	}
	tx, e := db.BeginTx(ctx, nil)
	if e != nil {
		return result, e
	}
	defer tx.Rollback()
	result, e = applyMigrationTransaction(ctx, tx, m, checks)
	if e != nil {
		return result, e
	}
	if apply {
		if e = tx.Commit(); e != nil {
			return result, e
		}
		result.Applied = true
	} else if e = tx.Rollback(); e != nil {
		return result, e
	}
	result.Validated = true
	return result, nil
}

func applyMigrationTransaction(ctx context.Context, tx *sql.Tx, m Migration, checks []string) (MigrationResult, error) {
	result := MigrationResult{Version: m.Version, SHA256: m.SHA256, StatementCount: m.StatementCount}
	if len(checks) == 0 {
		return result, errors.New("migration protection checks are required")
	}
	var e error
	if _, e = tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtext('continua-native-schema-migration'))`); e != nil {
		return result, e
	}
	var name string
	e = tx.QueryRowContext(ctx, `SELECT name FROM supabase_migrations.schema_migrations WHERE version=$1`, m.Version).Scan(&name)
	if e != nil && !errors.Is(e, sql.ErrNoRows) {
		return result, e
	}
	result.AlreadyApplied = e == nil
	if result.AlreadyApplied && name != m.Name {
		return result, errors.New("migration version/name conflict")
	}
	if !result.AlreadyApplied {
		if m.Version == "20261010210000" {
			var absent bool
			if e = tx.QueryRowContext(ctx, "SELECT to_regclass('public.paystack_live_orders') IS NULL").Scan(&absent); e != nil {
				return result, e
			}
			if !absent {
				return result, errors.New("untracked live payment ledger requires explicit review")
			}
		}
		if _, e = tx.ExecContext(ctx, m.SQL); e != nil {
			return result, e
		}
		if _, e = tx.ExecContext(ctx, `INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES($1,$2,ARRAY[$3]::text[])`, m.Version, m.Name, m.SQL); e != nil {
			return result, e
		}
	}
	for _, check := range checks {
		var passed bool
		if e = tx.QueryRowContext(ctx, check).Scan(&passed); e != nil {
			return result, e
		}
		if !passed {
			return result, errors.New("migration protection check failed")
		}
	}
	if e = migrationBehavior(ctx, tx, m.Version); e != nil {
		return result, e
	}
	return result, nil
}

// A multi-migration operator workflow is one atomic unit, including all
// postconditions and rolled-back behavioral fixtures. No partial apply.
func ApplyMigrationSet(ctx context.Context, db *sql.DB, migrations []Migration, apply bool) ([]MigrationResult, error) {
	if len(migrations) == 0 || len(migrations) > 20 {
		return nil, errors.New("migration workflow budget")
	}
	checks := make([][]string, len(migrations))
	seen := map[string]bool{}
	for i, m := range migrations {
		if seen[m.Version] {
			return nil, errors.New("duplicate workflow migration")
		}
		seen[m.Version] = true
		var err error
		checks[i], err = ProtectionChecks(m.Version)
		if err != nil {
			return nil, err
		}
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	results := make([]MigrationResult, 0, len(migrations))
	for i, m := range migrations {
		result, err := applyMigrationTransaction(ctx, tx, m, checks[i])
		if err != nil {
			return nil, err
		}
		results = append(results, result)
	}
	if apply {
		err = tx.Commit()
	} else {
		err = tx.Rollback()
	}
	if err != nil {
		return nil, err
	}
	for i := range results {
		results[i].Applied = apply
		results[i].Validated = true
	}
	return results, nil
}
