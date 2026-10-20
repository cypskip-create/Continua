package marketdata

import (
	"strings"
)

// All arguments are private SQL identifiers/static parameters, never HTTP input.
// A review authorizes its exact statement values, not later unreviewed edits or
// fields omitted from that review. Only the latest component review applies.
func reviewedComponentSQL(alias, period, bypass, kind, table string) string {
	fields := financialWriteFields[table]
	if len(fields) == 0 {
		panic("unknown reviewed financial component")
	}
	defaults := []string{}
	pairs := []string{}
	for _, field := range fields {
		defaults = append(defaults, "'"+field.json+"',NULL")
		pairs = append(pairs, "'"+field.json+"',"+alias+"."+field.sql)
	}
	return "(" + bypass + " OR jsonb_build_object(" + strings.Join(pairs, ",") + ") = (SELECT CASE WHEN jsonb_typeof(review.reviewed_values)='object' AND (review.reviewed_values->>'periodId' IS NULL OR review.reviewed_values->>'periodId'=" + period + ".id) THEN jsonb_build_object(" + strings.Join(defaults, ",") + ") || (review.reviewed_values-'periodId') ELSE NULL::jsonb END FROM market.filing_history_reviews review WHERE review.period_id=" + period + ".id AND review.statement_type='" + kind + "' ORDER BY review.id DESC LIMIT 1))"
}
