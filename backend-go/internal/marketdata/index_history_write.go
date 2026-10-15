package marketdata

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"math"
	"time"
)

// Permission is read under a shared row lock within the publication transaction.
// It cannot be revoked between checking it and inserting an observation.
func (s *Store) PublishNSEIndexHistory(ctx context.Context, indices []IndexInput, now time.Time) error {
	if len(indices) > 100 {
		return errors.New("index history batch limit")
	}
	if len(indices) == 0 {
		return nil
	}
	tx, e := s.DB.BeginTx(ctx, nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	var enabled bool
	var permission sql.NullString
	e = tx.QueryRowContext(ctx, `SELECT enabled,config->>'permissionReference' FROM scraping.sources WHERE id='nse-index-summary' FOR SHARE`).Scan(&enabled, &permission)
	if e == sql.ErrNoRows || (e == nil && (!enabled || !permission.Valid || permission.String == "")) {
		return nil
	}
	if e != nil {
		return e
	}
	if len(permission.String) > 200 {
		return errors.New("invalid permission reference")
	}
	seen := map[string]bool{}
	for _, v := range indices {
		if v.Exchange != "NSE" || v.Source != "eod" {
			continue
		}
		at, e := time.Parse(time.RFC3339Nano, v.Timestamp)
		if e != nil || at.After(now) || v.Code == "" || len(v.Code) > 100 || v.Name == "" || len(v.Name) > 300 || v.Value == nil || v.PreviousClose == nil || v.Change == nil {
			return errors.New("invalid dated index history")
		}
		for _, n := range []*float64{v.Value, v.PreviousClose, v.Change} {
			if math.IsNaN(*n) || math.IsInf(*n, 0) {
				return errors.New("nonfinite index history")
			}
		}
		id := "nse-index:" + v.Code + ":" + at.UTC().Format("2006-01-02")
		if seen[id] {
			return errors.New("duplicate index history key")
		}
		seen[id] = true
		payload, e := json.Marshal(map[string]any{"indicator": v.Code, "actual": v.Value, "previous": v.PreviousClose, "change": v.Change, "unit": "points", "permissionReference": permission.String})
		if e != nil {
			return e
		}
		_, e = tx.ExecContext(ctx, `INSERT INTO market.research_records(id,kind,title,symbol,observed_at,source_url,payload,verified_at) VALUES($1,'market_statistics',$2,NULL,$3,'https://www.nse.co.ke/',$4::jsonb,now()) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now(),verified_at=now() WHERE market.research_records.source_url=EXCLUDED.source_url AND market.research_records.payload IS DISTINCT FROM EXCLUDED.payload`, id, v.Name, v.Timestamp, string(payload))
		if e != nil {
			return e
		}
	}
	return tx.Commit()
}
