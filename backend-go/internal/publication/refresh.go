package publication

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"time"
)

func enqueueRefresh(ctx context.Context, tx *sql.Tx, id, symbol string) error {
	_, err := tx.ExecContext(ctx, `INSERT INTO market.native_research_refresh(security_id,symbol) VALUES($1,$2)
 ON CONFLICT(security_id) DO UPDATE SET symbol=EXCLUDED.symbol,requested_version=market.native_research_refresh.requested_version+1,
 requested_at=now(),next_attempt_at=now(),attempts=0,last_error=NULL`, id, symbol)
	return err
}

// Claim commits before computation: retaining an outbox row lock while taking
// the issuer's research lock would invert the publisher's lock order.
// Lease/version CAS retains a new filing arriving during a refresh, and recovers
// abandoned claims after process termination without in-memory retry state.
func (s *Service) DrainRefresh(ctx context.Context, limit int) (int, error) {
	if !s.DurableRefresh || s.DB == nil || s.RefreshResearch == nil || limit < 1 || limit > 100 {
		return 0, errors.New("native refresh worker unavailable")
	}
	completed := 0
	for i := 0; i < limit; i++ {
		if err := ctx.Err(); err != nil {
			return completed, err
		}
		entropy := make([]byte, 16)
		if _, err := rand.Read(entropy); err != nil {
			return completed, err
		}
		token := hex.EncodeToString(entropy)
		var id, symbol string
		var version int64
		err := s.DB.QueryRowContext(ctx, `WITH due AS (
 SELECT security_id FROM market.native_research_refresh
 WHERE next_attempt_at<=now() AND (lease_until IS NULL OR lease_until<=now())
 ORDER BY next_attempt_at,security_id FOR UPDATE SKIP LOCKED LIMIT 1)
 UPDATE market.native_research_refresh r SET lease_token=$1,lease_until=now()+interval '5 minutes'
 FROM due WHERE r.security_id=due.security_id RETURNING r.security_id,r.symbol,r.requested_version`, token).Scan(&id, &symbol, &version)
		if errors.Is(err, sql.ErrNoRows) {
			break
		}
		if err != nil {
			return completed, err
		}
		refreshCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
		err = s.RefreshResearch(refreshCtx, id, symbol)
		cancel()
		// Use a short cleanup budget even if the caller was cancelled; lease expiry
		// remains the recovery fallback if this connection fails.
		cleanup, stop := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		if err == nil {
			result, e := s.DB.ExecContext(cleanup, `DELETE FROM market.native_research_refresh WHERE security_id=$1 AND lease_token=$2 AND requested_version=$3`, id, token, version)
			if e == nil {
				var count int64
				count, e = result.RowsAffected()
				if e == nil && count > 0 {
					completed++
				}
			}
			if e == nil {
				_, e = s.DB.ExecContext(cleanup, `UPDATE market.native_research_refresh SET lease_token=NULL,lease_until=NULL WHERE security_id=$1 AND lease_token=$2`, id, token)
			}
			stop()
			if e != nil {
				return completed, e
			}
		} else {
			_, e := s.DB.ExecContext(cleanup, `UPDATE market.native_research_refresh SET lease_token=NULL,lease_until=NULL,
 attempts=CASE WHEN requested_version=$3 THEN LEAST(attempts+1,20) ELSE 0 END,
 next_attempt_at=CASE WHEN requested_version=$3 THEN now()+make_interval(secs=>LEAST(21600,30*power(2,LEAST(attempts,10)))::double precision) ELSE now() END,
 last_error='Native research refresh unavailable; retry scheduled' WHERE security_id=$1 AND lease_token=$2`, id, token, version)
			stop()
			if e != nil {
				return completed, e
			}
		}
	}
	return completed, nil
}
