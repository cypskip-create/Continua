package maintenance

import "errors"

// Paths are explicit repository-owned inputs, not database-supplied SQL.
func ReadWorkflow(repo, name string) ([]Migration, error) {
	workflows := map[string][]string{
		"checkout-policy":           {"supabase/migrations/20261012020000_checkout_policy_receipt.sql"},
		"document-validation":       {"supabase/migrations/20261011110000_document_auto_validation.sql"},
		"invalid-filing-archive":    {"supabase/migrations/20261011100000_invalid_filing_archive.sql"},
		"partial-statements":        {"supabase/migrations/20261011123000_partial_reported_statements.sql"},
		"native-payments":           {"supabase/migrations/20261012220000_native_payment_attempts.sql"},
		"research-refresh":          {"backend/migration/20261013090000 native research refresh outbox.sql"},
		"kakuzi-archive-identity":   {"supabase/migrations/20261011160000_kakuzi_archive_identity.sql"},
		"paystack-live-ledger":      {"supabase/migrations/20261010210000_paystack_live_checkout.sql"},
		"observed-daily-closes":     {"backend/migration/20261015110000 native observed daily closes.sql"},
		"engine-research-expansion": {"supabase/migrations/20261012010000_engine_forecast_notebook.sql", "supabase/migrations/20261012011000_financial_version_audit.sql"},
		"community-safety":          {"supabase/migrations/20261012030000_community_safety.sql"},
		"history":                   {"supabase/migrations/20261010220000_historical_document_queue.sql"},
		"candle-provenance":         {"supabase/migrations/20261011211500_candle_provenance.sql"},
	}
	paths, ok := workflows[name]
	if !ok {
		return nil, errors.New("unknown native operator workflow")
	}
	result := make([]Migration, 0, len(paths))
	for _, path := range paths {
		migration, err := ReadMigration(repo, path)
		if err != nil {
			return nil, err
		}
		result = append(result, migration)
	}
	return result, nil
}
