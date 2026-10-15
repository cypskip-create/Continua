package marketdata

import (
	"context"
	"encoding/json"
	"testing"
)

func verifyResearchPostgresFixture(t *testing.T, store *Store, ctx context.Context) {
	t.Helper()
	const id = "NSE:KCB"
	var at string
	if err := store.DB.QueryRowContext(ctx, `SELECT to_char(event_timestamp AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') FROM market.live_quotes WHERE security_id=$1`, id).Scan(&at); err != nil {
		t.Fatal(err)
	}
	basis, err := store.ResearchBasis(ctx, id, at)
	if err != nil {
		t.Fatal("research version unavailable", err)
	}
	ratios, _ := json.Marshal(map[string]any{"securityId": id, "asOf": at, "pe": 7.73, "netMargin": .3})
	score, _ := json.Marshal(map[string]any{"securityId": id, "asOf": at, "afriScore": 50, "afriValue": 50, "afriGrowth": 50, "afriHealth": 50, "afriIncome": 50, "afriRisk": 50, "afriQuality": 50, "afriMomentum": 50, "inputs": map[string]any{"syntheticFixture": true}})
	stored, err := store.PersistResearch(ctx, ratios, score, basis, 30)
	if err != nil || !stored {
		t.Fatal("actual paired research write failed", err)
	}
	actualRatios, err := store.Ratios(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	actualScore, err := store.AfriScore(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if current, err := store.ResearchIsCurrent(ctx, id, actualRatios, actualScore); err != nil || current {
		t.Fatal("pending refresh was called current", err)
	}
	// Simulate completion of this exact fixture issuer's durable refresh job.
	if _, err = store.DB.ExecContext(ctx, `DELETE FROM market.native_research_refresh WHERE security_id=$1`, id); err != nil {
		t.Fatal(err)
	}
	if current, err := store.ResearchIsCurrent(ctx, id, actualRatios, actualScore); err != nil || !current {
		t.Fatal("persisted native basis did not round-trip", err)
	}
	changed, _ := json.Marshal(map[string]any{"securityId": id, "asOf": at, "pe": 13.96, "netMargin": .3})
	if current, err := store.ResearchIsCurrent(ctx, id, changed, actualScore); err != nil || current {
		t.Fatal("mixed PE pair accepted", err)
	}
	// An out-of-band edit must neither inherit the old statement review nor
	// leave a cached research result marked current when the quote is unchanged.
	if _, err = store.DB.ExecContext(ctx, `UPDATE market.income_statements SET eps=999 WHERE period_id='NSE:period:KCB:2025'`); err != nil {
		t.Fatal(err)
	}
	raw, err := store.LatestFinancials(ctx, id, "annual")
	if err != nil {
		t.Fatal(err)
	}
	var fields map[string]any
	if json.Unmarshal(raw, &fields) != nil || fields["eps"] != nil || fields["revenue"] != nil || fields["totalAssets"] != float64(100) {
		t.Fatal("edited income inherited an old review")
	}
	if current, err := store.ResearchIsCurrent(ctx, id, actualRatios, actualScore); err != nil || current {
		t.Fatal("audit change without quote change left research current", err)
	}
}
