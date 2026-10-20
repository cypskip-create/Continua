package marketdata

import (
	"context"
	"encoding/json"
)

// Preserve unknown/unpriced holdings and aggregate only the verified owner.
const portfolioPositionsSQL = `WITH holdings AS (
 SELECT symbol,sum(shares)::float8 AS shares,max(sector) AS sector,
 sum(shares*avg_cost)::float8 AS cost FROM public.portfolios
 WHERE user_id=$1 GROUP BY symbol
), instruments AS (
 SELECT s.id,s.symbol,sec.name AS sector FROM market.securities s
 JOIN market.companies c ON c.id=s.company_id
 LEFT JOIN market.sectors sec ON sec.id=c.sector_id
 WHERE s.exchange=$2 AND s.status<>'delisted'
)
SELECT row_to_json(result) FROM (
 SELECT h.cost,upper(h.symbol) AS symbol,h.shares,
 COALESCE(NULLIF(i.sector,''),NULLIF(h.sector,''),'Unclassified') AS sector,
 q.last_price AS price,q.change,q.volume,COALESCE(q.currency,'unknown') AS currency,
 to_char(q.event_timestamp AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "asOf"
 FROM holdings h LEFT JOIN instruments i ON i.symbol=upper(h.symbol)
 LEFT JOIN market.live_quotes q ON q.security_id=i.id ORDER BY h.symbol
) result`

func (s *Store) PortfolioPositions(ctx context.Context, owner, exchange string) ([]json.RawMessage, error) {
	return s.JSONRows(ctx, portfolioPositionsSQL, owner, exchange)
}
