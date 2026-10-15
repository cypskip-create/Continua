// Explicit native operator command. Never invoke with real credentials in CI.
package main

import (
	"context"
	"continua/backend/internal/maintenance"
	"continua/backend/internal/marketdata"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"time"
)

func run(args []string) error {
	flags := flag.NewFlagSet("continua-key", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	name := flags.String("create-name", "", "data API key name")
	id := flags.String("revoke-id", "", "exact key UUID")
	rate := flags.Int("rate-limit", 120, "requests per minute")
	apply := flags.Bool("apply", false, "explicit mutation")
	if flags.Parse(args) != nil || flags.NArg() != 0 || (*name == "") == (*id == "") {
		return errors.New("choose --create-name NAME or --revoke-id UUID; --apply is required to mutate")
	}
	if *name != "" {
		if err := maintenance.ValidateKeyName(*name, *rate); err != nil {
			return err
		}
	}
	if *id != "" {
		if err := maintenance.ValidateKeyID(*id); err != nil {
			return err
		}
	}
	if !*apply {
		return json.NewEncoder(os.Stdout).Encode(map[string]any{"mode": "offline-plan", "applied": false, "create": *name != "", "revoke": *id != ""})
	}
	if os.Getenv("DATABASE_URL") == "" {
		return errors.New("database configuration required")
	}
	store, err := marketdata.Open(os.Getenv("DATABASE_URL"))
	if err != nil {
		return errors.New("database configuration rejected")
	}
	defer store.DB.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if *id != "" {
		if err := maintenance.RevokeKey(ctx, store.DB, *id); err != nil {
			return err
		}
		return json.NewEncoder(os.Stdout).Encode(map[string]any{"revoked": true, "id": *id, "maximumAuthCacheSeconds": 30})
	}
	result, err := maintenance.CreateKey(ctx, store.DB, *name, *rate)
	if err != nil {
		return err
	}
	// Explicit operator output only. Do not redirect this to shared logs.
	return json.NewEncoder(os.Stdout).Encode(result)
}
func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		os.Exit(1)
	}
}
