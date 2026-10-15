package main

import "testing"

func TestAdminRejectsAmbiguousOrConflictingOperationsBeforeDatabaseAccess(t *testing.T) {
	for _, args := range [][]string{
		{},
		{"--workflow", "history", "--migration", "supabase/migrations/20261011211500_candle_provenance.sql"},
		{"--workflow", "history", "--apply", "--validate"},
		{"--inspect", "payment-schema", "--apply"},
		{"--revalidate-news", "--batches", "0"},
		{"--workflow", "not-registered"},
	} {
		if run(args) == nil {
			t.Fatal("invalid operator command accepted")
		}
	}
}
