// Native operator migration CLI. Offline planning is the default, not mutation.
package main

import (
	"context"
	"continua/backend/internal/engine"
	"continua/backend/internal/ingestion"
	"continua/backend/internal/maintenance"
	"continua/backend/internal/marketdata"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"regexp"
	"time"
)

func run(args []string) error {
	flags := flag.NewFlagSet("continua-admin", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	repo := flags.String("repo", ".", "repository root")
	path := flags.String("migration", "", "repository-relative SQL path")
	workflow := flags.String("workflow", "", "registered native operator workflow")
	inspection := flags.String("inspect", "", "fixed read-only native inspection")
	historyFile := flags.String("import-history", "", "reviewed historical observation JSON file")
	researchFile := flags.String("import-research", "", "reviewed official research observation JSON file")
	revalidateNews := flags.Bool("revalidate-news", false, "rebuild source-evidenced news issuer links")
	after := flags.String("after", "0", "resumable news row cursor")
	batches := flags.Int("batches", 100, "maximum bounded news pages")
	source := flags.String("source", "kenyanstocks", "exact source identifier for inspection")
	symbol := flags.String("symbol", "KCB", "exact NSE symbol for inspection")
	owner := flags.String("owner", "", "explicit owned account UUID for portfolio diagnostics")
	validate := flags.Bool("validate", false, "validate inside a rolled-back transaction")
	apply := flags.Bool("apply", false, "apply the explicitly selected SQL migration")
	if flags.Parse(args) != nil || flags.NArg() != 0 || (*validate && *apply) {
		return fmt.Errorf("usage: continua-admin --repo ROOT (--migration RELATIVE_SQL | --workflow NAME) [--validate | --apply]")
	}
	selected := 0
	for _, value := range []string{*path, *workflow, *inspection, *historyFile, *researchFile} {
		if value != "" {
			selected++
		}
	}
	if *revalidateNews {
		selected++
	}
	if selected != 1 {
		return fmt.Errorf("select exactly one migration, workflow or inspection")
	}
	if *revalidateNews {
		if *batches < 1 || *batches > 2000 {
			return fmt.Errorf("news page limit must be 1 to 2000")
		}
		if !*apply {
			return json.NewEncoder(os.Stdout).Encode(map[string]any{"mode": "offline-plan", "operation": "revalidate-news", "after": *after, "batches": *batches, "applied": false})
		}
		python, script := os.Getenv("NATIVE_PYTHON_BIN"), os.Getenv("NATIVE_PYTHON_SCRIPT")
		if python == "" {
			return fmt.Errorf("explicit native Python worker required")
		}
		if script == "" {
			script = "engine-python/worker.py"
		}
		store, err := marketdata.Open(os.Getenv("DATABASE_URL"))
		if err != nil {
			return fmt.Errorf("news storage unavailable")
		}
		defer store.DB.Close()
		worker := engine.NewEvidenceWorker(python, script)
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
		defer cancel()
		cursor := *after
		processed, corrected := 0, 0
		complete := false
		for index := 0; index < *batches; index++ {
			receipt, err := ingestion.RevalidateNews(ctx, store, worker, cursor, 100)
			if err != nil {
				return fmt.Errorf("news revalidation interrupted; committed rows remain idempotently resumable")
			}
			processed += receipt.Processed
			corrected += receipt.Corrected
			cursor = receipt.LastID
			if receipt.Processed < 100 {
				complete = true
				break
			}
		}
		return json.NewEncoder(os.Stdout).Encode(map[string]any{"processed": processed, "corrected": corrected, "after": cursor, "complete": complete, "articlesDeleted": false, "publisherDatesChanged": false})
	}
	if *researchFile != "" {
		file, err := os.Open(*researchFile)
		if err != nil {
			return fmt.Errorf("research input unavailable")
		}
		defer file.Close()
		stat, err := file.Stat()
		if err != nil || !stat.Mode().IsRegular() || stat.Size() > 4*1024*1024 {
			return fmt.Errorf("bounded regular research file required")
		}
		store := &marketdata.Store{}
		if *apply {
			store, err = marketdata.Open(os.Getenv("DATABASE_URL"))
			if err != nil {
				return fmt.Errorf("research import storage unavailable")
			}
			defer store.DB.Close()
		}
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancel()
		count, err := store.ImportResearch(ctx, file, *apply, time.Now().UTC())
		if err != nil {
			return fmt.Errorf("research import rejected; no transaction committed")
		}
		return json.NewEncoder(os.Stdout).Encode(map[string]any{"observations": count, "applied": *apply})
	}
	if *historyFile != "" {
		file, err := os.Open(*historyFile)
		if err != nil {
			return fmt.Errorf("history input unavailable")
		}
		defer file.Close()
		stat, err := file.Stat()
		if err != nil || !stat.Mode().IsRegular() || stat.Size() > 64*1024*1024 {
			return fmt.Errorf("bounded regular history file required")
		}
		store, err := marketdata.Open(os.Getenv("DATABASE_URL"))
		if err != nil {
			return fmt.Errorf("history import storage unavailable")
		}
		defer store.DB.Close()
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()
		result, err := store.ImportHistorical(ctx, file, *apply, time.Now().UTC())
		if err != nil {
			return fmt.Errorf("history import rejected; transaction rolled back")
		}
		return json.NewEncoder(os.Stdout).Encode(result)
	}
	if *inspection != "" {
		if *validate || *apply {
			return fmt.Errorf("inspection is strictly read-only")
		}
		store, err := marketdata.Open(os.Getenv("DATABASE_URL"))
		if err != nil {
			return fmt.Errorf("inspection database unavailable")
		}
		defer store.DB.Close()
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		if *inspection == "portfolio-overview" {
			if !regexp.MustCompile(`^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$`).MatchString(*owner) {
				return fmt.Errorf("explicit account UUID required; no account enumeration is performed")
			}
			python, script := os.Getenv("NATIVE_PYTHON_BIN"), os.Getenv("NATIVE_PYTHON_SCRIPT")
			if python == "" {
				return fmt.Errorf("native portfolio calculation worker required")
			}
			if script == "" {
				script = "engine-python/worker.py"
			}
			started := time.Now()
			positions, err := store.PortfolioPositions(ctx, *owner, "NSE")
			if err != nil {
				return fmt.Errorf("owned portfolio input unavailable")
			}
			worker := engine.NewWorker(python, script)
			raw, err := worker.Calculate(ctx, engine.Request{Operation: "portfolio_overview", Args: []any{positions, "NSE", time.Now().UTC().Format(time.RFC3339Nano)}})
			if err != nil {
				return fmt.Errorf("portfolio overview calculation unavailable")
			}
			var summary struct {
				HoldingCount int `json:"holdingCount"`
				PricedCount  int `json:"pricedCount"`
			}
			if json.Unmarshal(raw, &summary) != nil {
				return fmt.Errorf("invalid portfolio overview receipt")
			}
			return json.NewEncoder(os.Stdout).Encode(map[string]any{"ok": true, "ms": time.Since(started).Milliseconds(), "holdingCount": summary.HoldingCount, "pricedCount": summary.PricedCount})
		}
		result, err := maintenance.Inspect(ctx, store.DB, *inspection, *source, *symbol)
		if err != nil {
			return fmt.Errorf("native inspection unavailable (%s)",maintenance.SafeDatabaseCode(err))
		}
		return json.NewEncoder(os.Stdout).Encode(result)
	}
	if *workflow != "" {
		return runWorkflow(*repo, *workflow, *validate, *apply)
	}
	migration, e := maintenance.ReadMigration(*repo, *path)
	if e != nil {
		return fmt.Errorf("migration planning rejected")
	}
	if !*validate && !*apply {
		return json.NewEncoder(os.Stdout).Encode(map[string]any{"version": migration.Version, "name": migration.Name, "sha256": migration.SHA256, "statementCount": migration.StatementCount, "mode": "offline-plan", "applied": false})
	}
	if os.Getenv("DATABASE_URL") == "" {
		return fmt.Errorf("database configuration is required")
	}
	checks, e := maintenance.ProtectionChecks(migration.Version)
	if e != nil {
		return e
	}
	store, e := marketdata.Open(os.Getenv("DATABASE_URL"))
	if e != nil {
		return fmt.Errorf("database configuration rejected")
	}
	defer store.DB.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	result, e := maintenance.ApplyMigration(ctx, store.DB, migration, *apply, checks)
	if e != nil {
		return fmt.Errorf("migration failed; transaction rolled back")
	}
	return json.NewEncoder(os.Stdout).Encode(result)
}

func runWorkflow(repo, name string, validate, apply bool) error {
	migrations, err := maintenance.ReadWorkflow(repo, name)
	if err != nil {
		return fmt.Errorf("operator workflow planning rejected")
	}
	if !validate && !apply {
		plans := make([]map[string]any, 0, len(migrations))
		for _, migration := range migrations {
			plans = append(plans, map[string]any{"version": migration.Version, "name": migration.Name, "sha256": migration.SHA256, "statementCount": migration.StatementCount})
		}
		return json.NewEncoder(os.Stdout).Encode(map[string]any{"workflow": name, "mode": "offline-plan", "applied": false, "migrations": plans})
	}
	if os.Getenv("DATABASE_URL") == "" {
		return fmt.Errorf("database configuration is required")
	}
	store, err := marketdata.Open(os.Getenv("DATABASE_URL"))
	if err != nil {
		return fmt.Errorf("database configuration rejected")
	}
	defer store.DB.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	results, err := maintenance.ApplyMigrationSet(ctx, store.DB, migrations, apply)
	if err != nil {
		return fmt.Errorf("operator workflow failed; transaction rolled back")
	}
	return json.NewEncoder(os.Stdout).Encode(map[string]any{"workflow": name, "migrations": results, "applied": apply, "validated": true, "fixturesRolledBack": true})
}
func main() {
	if e := run(os.Args[1:]); e != nil {
		fmt.Fprintln(os.Stderr, e.Error())
		os.Exit(1)
	}
}
