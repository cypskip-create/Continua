package marketdata

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
)

type Screen struct {
	Exchange, Sector, SortBy, Direction string
	Limit                               int
	Numbers                             map[string]float64
}

func (s *Store) Screen(ctx context.Context, f Screen) ([]json.RawMessage, error) {
	columns := map[string]string{"afriScore": "sc.afri_score", "changePercent": "q.change_percent", "marketCap": "q.market_cap", "dividendYield": "r.dividend_yield", "pe": "r.pe"}
	column := columns[f.SortBy]
	if f.Exchange != "NSE" || column == "" || (f.Direction != "asc" && f.Direction != "desc") || f.Limit < 1 || f.Limit > 200 {
		return nil, errors.New("invalid screening options")
	}
	direction := "ASC"
	if f.Direction == "desc" {
		direction = "DESC"
	}
	conditions := []string{"s.exchange=$1", "s.status='active'"}
	args := []any{f.Exchange}
	add := func(condition string, v any) {
		args = append(args, v)
		conditions = append(conditions, fmt.Sprintf(condition, len(args)))
	}
	if f.Sector != "" {
		add("LOWER(c.id)=LOWER($%d)", f.Sector)
	}
	for _, item := range []struct{ Key, Condition string }{{"minMarketCap", "q.market_cap >= $%d"}, {"maxPe", "r.pe <= $%d"}, {"minDividendYield", "r.dividend_yield >= $%d"}, {"minAfriScore", "sc.afri_score >= $%d"}} {
		if v, ok := f.Numbers[item.Key]; ok {
			if math.IsNaN(v) || math.IsInf(v, 0) {
				return nil, errors.New("nonfinite screening filter")
			}
			add(item.Condition, v)
		}
	}
	args = append(args, f.Limit)
	query := `SELECT row_to_json(result) FROM (SELECT s.symbol,s.id AS "securityId",co.name AS "companyName",c.name AS sector,
 q.last_price AS "lastPrice",q.change_percent AS "changePercent",q.market_cap AS "marketCap",r.pe,r.pb,r.roe,r.roa,
 r.net_margin AS "netMargin",r.debt_to_equity AS "debtToEquity",r.payout_ratio AS "payoutRatio",r.current_ratio AS "currentRatio",
 r.as_of AS "ratiosAsOf",r.price_momentum_3m AS "priceMomentum3m",r.dividend_yield AS "dividendYield",sc.afri_score AS "afriScore"
 FROM market.securities s JOIN market.companies co ON co.id=s.company_id LEFT JOIN market.sectors c ON c.id=co.sector_id
 LEFT JOIN market.live_quotes q ON q.security_id=s.id LEFT JOIN market.computed_ratios r ON r.security_id=s.id
 LEFT JOIN market.afri_scores sc ON sc.security_id=s.id WHERE ` + strings.Join(conditions, " AND ") + ` ORDER BY ` + column + ` ` + direction + ` NULLS LAST LIMIT $` + fmt.Sprint(len(args)) + `) result`
	return s.JSONRows(ctx, query, args...)
}
