package main

import (
	"encoding/json"
	"io"
	"os"
	"testing"
)

func TestKeyOperatorPlansOfflineWithoutDatabase(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	previous := os.Stdout
	os.Stdout = writer
	defer func() { os.Stdout = previous; reader.Close(); writer.Close() }()
	err = run([]string{"--create-name", "Fixture plan"})
	writer.Close()
	os.Stdout = previous
	if err != nil {
		t.Fatal(err)
	}
	body, err := io.ReadAll(reader)
	if err != nil {
		t.Fatal(err)
	}
	var result map[string]any
	if json.Unmarshal(body, &result) != nil || result["mode"] != "offline-plan" || result["applied"] != false || result["create"] != true {
		t.Fatal("invalid offline plan")
	}
	if _, exists := result["plaintextKey"]; exists {
		t.Fatal("offline plan generated a secret")
	}
}

func TestKeyOperatorRejectsAmbiguousInvalidOrUnconfiguredMutation(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	for _, args := range [][]string{
		{}, {"--create-name", "Fixture", "--revoke-id", "12345678-1234-1234-1234-123456789abc"},
		{"--revoke-id", "all"}, {"--create-name", "Fixture", "--rate-limit", "0"},
		{"--create-name", "Fixture", "--apply"},
	} {
		if err := run(args); err == nil {
			t.Fatal("invalid operator request accepted")
		}
	}
}
