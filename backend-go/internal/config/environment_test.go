package config

import "testing"

func TestBooleanDoesNotTreatFalseStringAsEnabled(t *testing.T) {
	for _, value := range []string{"false", "FALSE", "0", "no", ""} {
		enabled, err := Boolean(value, false)
		if err != nil || enabled {
			t.Fatalf("unexpected enabled flag for %q", value)
		}
	}
	for _, value := range []string{"true", "TRUE", "1", "yes"} {
		enabled, err := Boolean(value, false)
		if err != nil || !enabled {
			t.Fatalf("valid boolean rejected: %q", value)
		}
	}
	if _, err := Boolean("tru", false); err == nil {
		t.Fatal("misspelled flag silently accepted")
	}
}

func TestNativeConfigurationRejectsUnscopedOriginsAndIncompleteJobs(t *testing.T) {
	for _, values := range []map[string]string{
		{"DATABASE_URL": ""},
		{"DATABASE_URL": "fixture", "ALLOWED_ORIGINS": "https://user:secret@owned.example"},
		{"DATABASE_URL": "fixture", "ALLOWED_ORIGINS": "https://owned.example/path"},
		{"DATABASE_URL": "fixture", "ALLOWED_ORIGINS": "http://untrusted.example"},
		{"DATABASE_URL": "fixture", "NATIVE_ENABLE_PUBLICATION_WORKERS": "true"},
		{"DATABASE_URL": "fixture", "NATIVE_ENABLE_SOURCE_SYNC": "true"},
		{"DATABASE_URL": "fixture", "ADMIN_API_KEY": "short"},
		{"DATABASE_URL": "fixture", "NATIVE_ENABLE_CLOSE_PUBLICATION": "true"},
	} {
		if _, err := Load(func(key string) string { return values[key] }); err == nil {
			t.Fatal("invalid native configuration accepted")
		}
	}
	values := map[string]string{"DATABASE_URL": "fixture", "ALLOWED_ORIGINS": "https://owned.example,http://localhost:8080,https://owned.example", "NATIVE_ENABLE_PUBLICATION_WORKERS": "false"}
	cfg, err := Load(func(key string) string { return values[key] })
	if err != nil || len(cfg.Origins) != 2 || cfg.Flags["NATIVE_ENABLE_PUBLICATION_WORKERS"] {
		t.Fatalf("valid configuration rejected: %v", err)
	}
}
