package marketdata

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"math"
	"time"
)

func (s *Store) ResearchIsCurrent(ctx context.Context, id string, ratios, score json.RawMessage) (bool, error) {
	var r, a struct{ SecurityID, AsOf string }
	if json.Unmarshal(ratios, &r) != nil || json.Unmarshal(score, &a) != nil || r.SecurityID != id || a.SecurityID != id || r.AsOf != a.AsOf {
		return false, nil
	}
	if _, e := time.Parse(time.RFC3339Nano, r.AsOf); e != nil {
		return false, nil
	}
	var evidence struct {
		Inputs struct {
			Basis nativeResearchBasis `json:"continuaNativeBasis"`
		} `json:"inputs"`
	}
	if json.Unmarshal(score, &evidence) != nil {
		return false, nil
	}
	basis := evidence.Inputs.Basis
	digest, e := ratioDigest(ratios)
	if e != nil || basis.Method != nativeResearchMethod || basis.FilingVersion == "" || basis.RatioDigest != digest || basis.QuotePrice <= 0 || math.IsNaN(basis.QuotePrice) || math.IsInf(basis.QuotePrice, 0) {
		return false, nil
	}
	var current bool
	e = s.DB.QueryRowContext(ctx, `SELECT q.event_timestamp=$2::timestamptz AND q.last_price=$3 AND q.event_timestamp<=now() AND q.event_timestamp>=now()-interval '7 days' AND q.source<>'mock'
 AND (`+researchBasisSQL+`)=$4
 AND NOT EXISTS(SELECT 1 FROM market.native_research_refresh pending WHERE pending.security_id=q.security_id) FROM market.live_quotes q WHERE q.security_id=$1`, id, r.AsOf, basis.QuotePrice, basis.FilingVersion).Scan(&current)
	if errors.Is(e, sql.ErrNoRows) {
		return false, nil
	}
	return current, e
}
