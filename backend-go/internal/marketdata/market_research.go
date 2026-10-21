package marketdata

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5/pgconn"
)

func (s *Store) MarketSnapshot(ctx context.Context) ([]json.RawMessage, error) {
	return s.JSONRows(ctx, `SELECT row_to_json(result) FROM (SELECT s.symbol,c.name AS sector,q.change_percent AS "changePercent",q.volume,
 to_char(q.event_timestamp AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS timestamp
 FROM market.live_quotes q JOIN market.securities s ON s.id=q.security_id JOIN market.companies co ON co.id=s.company_id
 LEFT JOIN market.sectors c ON c.id=co.sector_id WHERE s.exchange='NSE' AND s.status='active' AND q.last_price>0) result`)
}
func (s *Store) ResearchRecords(ctx context.Context) (json.RawMessage, error) {
	rows, err := s.JSONRows(ctx, `SELECT row_to_json(result) FROM (SELECT id,kind,title,symbol,observed_at AS "observedAt",source_url AS "sourceUrl",payload FROM market.research_records WHERE verified_at IS NOT NULL ORDER BY observed_at DESC LIMIT 2000) result`)
	var pg *pgconn.PgError
	if errors.As(err, &pg) && pg.Code == "42P01" {
		return json.RawMessage(`{"records":[],"available":false}`), nil
	}
	if err != nil {
		return nil, err
	}
	return json.Marshal(map[string]any{"records": rows, "available": true})
}
func (s *Store) MarketEarnings(ctx context.Context) ([]json.RawMessage, error) {
	return s.JSONRows(ctx, `SELECT row_to_json(result) FROM (SELECT ee.id,sec.symbol,c.name AS "companyName",ee.fiscal_year AS "fiscalYear",
 ee.fiscal_quarter AS "fiscalQuarter",ee.expected_date AS "expectedDate",
 CASE WHEN reviewed.id IS NOT NULL THEN reviewed.reported_at ELSE ee.reported_date END AS "reportedDate",
 CASE WHEN reviewed.id IS NOT NULL THEN reviewed.eps ELSE ee.eps_actual END AS "epsActual",ee.eps_estimate AS "epsEstimate",
 CASE WHEN reviewed.id IS NOT NULL THEN reviewed.revenue ELSE ee.revenue_actual END AS "revenueActual",ee.revenue_estimate AS "revenueEstimate"
 FROM market.earnings_events ee JOIN market.securities sec ON sec.id=ee.security_id JOIN market.companies c ON c.id=sec.company_id `+reviewedEarningsJoin+`
 WHERE sec.exchange='NSE' AND sec.status<>'delisted' ORDER BY COALESCE(reviewed.reported_at,ee.reported_date,ee.expected_date) DESC NULLS LAST LIMIT 300) result`)
}
func (s *Store) FinancialVersions(ctx context.Context, id string) ([]json.RawMessage, error) {
	return s.JSONRows(ctx, `SELECT row_to_json(result) FROM (SELECT id,table_name,period_id,operation,before_payload,after_payload,recorded_at,transaction_id FROM market.financial_version_audit WHERE security_id=$1 ORDER BY recorded_at DESC,id DESC LIMIT 100) result`, id)
}
func (s *Store) LabHistory(ctx context.Context, id, start, end string) ([]json.RawMessage, error) {
	return s.JSONRows(ctx, `SELECT row_to_json(result) FROM (SELECT DISTINCT ON(bar_time::date) bar_time::date::text AS date,close,source_url AS "sourceUrl",(SELECT currency FROM market.securities WHERE id=$1) AS currency FROM market.candles WHERE security_id=$1 AND interval='1d' AND bar_time>=$2::date AND bar_time<$3::date+interval '1 day' AND close>0 AND source_url LIKE 'https://%' ORDER BY bar_time::date,bar_time DESC LIMIT 1501) result`, id, start, end)
}
