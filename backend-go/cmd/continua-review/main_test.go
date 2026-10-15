package main

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

func TestMutatingReviewCommandsDefaultToOfflinePlans(t *testing.T) {
	for _, args := range [][]string{
		{"--operation", "run-job", "--job", "document-publication"},
		{"--operation", "reject", "--candidate", "12", "--note", "private review detail"},
		{"--operation", "repair-condensed", "--extraction", "136"},
	} {
		var output bytes.Buffer
		if err := run(args, &output); err != nil {
			t.Fatal(err)
		}
		var plan map[string]any
		if json.Unmarshal(output.Bytes(), &plan) != nil || plan["mode"] != "offline-plan" || plan["submitted"] != false {
			t.Fatal("operator action was not an offline plan")
		}
		if strings.Contains(output.String(), "private review detail") {
			t.Fatal("private review body appeared in offline output")
		}
	}
}

func TestReviewCommandsRejectUnregisteredJobsAndInvalidIdentifiers(t *testing.T) {
	for _, args := range [][]string{
		{"--operation", "run-job", "--job", "../../billing"},
		{"--operation", "candidate", "--candidate", "0"},
		{"--operation", "repair-condensed", "--extraction", "-1"},
		{"--operation", "list-candidates", "--limit", "1000"},
	} {
		if run(args, &bytes.Buffer{}) == nil {
			t.Fatal("unsafe operator request accepted")
		}
	}
}
