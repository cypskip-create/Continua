package marketdata

import (
	"context"
	"errors"
)

// QueueRegistryRefresh uses the live registry and the existing recoverable
// outbox. It does not start one goroutine or calculation per listed company.
func (s *Store) QueueRegistryRefresh(ctx context.Context, exchange string) (int64, error) {
	if exchange != "NSE" {
		return 0, errors.New("invalid research exchange")
	}
	result, err := s.DB.ExecContext(ctx, `INSERT INTO market.native_research_refresh(security_id,symbol)
 SELECT id,symbol FROM market.securities WHERE exchange=$1 AND status<>'delisted'
 ORDER BY id ON CONFLICT(security_id) DO UPDATE SET symbol=EXCLUDED.symbol,
 requested_version=market.native_research_refresh.requested_version+1,
 requested_at=now(),next_attempt_at=LEAST(market.native_research_refresh.next_attempt_at,now()),
 attempts=0,last_error=NULL`, exchange)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}
