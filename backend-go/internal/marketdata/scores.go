package marketdata

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5/pgconn"
	"regexp"
	"strings"
)

type scoreField struct{ json, sql string }

var ratioFields = []scoreField{{"pe", "pe"}, {"ps", "ps"}, {"pb", "pb"}, {"evEbitda", "ev_ebitda"}, {"roe", "roe"}, {"roa", "roa"}, {"roic", "roic"}, {"grossMargin", "gross_margin"}, {"operatingMargin", "operating_margin"}, {"netMargin", "net_margin"}, {"dividendYield", "dividend_yield"}, {"payoutRatio", "payout_ratio"}, {"currentRatio", "current_ratio"}, {"debtToEquity", "debt_to_equity"}, {"interestCoverage", "interest_coverage"}, {"priceMomentum3m", "price_momentum_3m"}, {"volatility90d", "volatility_90d"}}
var afriFields = []scoreField{{"afriScore", "afri_score"}, {"afriValue", "afri_value"}, {"afriGrowth", "afri_growth"}, {"afriHealth", "afri_health"}, {"afriIncome", "afri_income"}, {"afriRisk", "afri_risk"}, {"afriQuality", "afri_quality"}, {"afriMomentum", "afri_momentum"}}

func (s *Store) Ratios(ctx context.Context, id string) (json.RawMessage, error) {
	rows, err := s.JSONRows(ctx, `SELECT row_to_json(result) FROM (SELECT security_id AS "securityId",to_char(as_of AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "asOf",pe,
 COALESCE((to_jsonb(computed_ratios)->>'ps')::numeric,pe*net_margin) AS ps,pb,ev_ebitda AS "evEbitda",roe,roa,roic,
 gross_margin AS "grossMargin",operating_margin AS "operatingMargin",net_margin AS "netMargin",dividend_yield AS "dividendYield",payout_ratio AS "payoutRatio",
 current_ratio AS "currentRatio",debt_to_equity AS "debtToEquity",interest_coverage AS "interestCoverage",price_momentum_3m AS "priceMomentum3m",volatility_90d AS "volatility90d"
 FROM market.computed_ratios WHERE security_id=$1) result`, id)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}
	return rows[0], nil
}
func (s *Store) AfriScore(ctx context.Context, id string) (json.RawMessage, error) {
	rows, err := s.JSONRows(ctx, `SELECT row_to_json(result) FROM (SELECT security_id AS "securityId",to_char(as_of AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "asOf",
 afri_score AS "afriScore",afri_value AS "afriValue",afri_growth AS "afriGrowth",afri_health AS "afriHealth",afri_income AS "afriIncome",afri_risk AS "afriRisk",afri_quality AS "afriQuality",afri_momentum AS "afriMomentum",inputs
 FROM market.afri_scores WHERE security_id=$1) result`, id)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}
	return rows[0], nil
}

type SectorAverage struct {
	AvgPE            *float64 `json:"avgPe"`
	AvgDividendYield *float64 `json:"avgDividendYield"`
	SampleSize       int64    `json:"sampleSize"`
}

func (s *Store) SectorAverage(ctx context.Context, exchange, sectorID, excludeID string, fiscalYear *int) (*SectorAverage, error) {
	result := &SectorAverage{}
	err := s.DB.QueryRowContext(ctx, `SELECT AVG(q.last_price/f.eps),NULL::numeric,COUNT(*) FROM market.securities s
 JOIN market.companies c ON c.id=s.company_id JOIN market.live_quotes q ON q.security_id=s.id
 JOIN LATERAL(SELECT COALESCE(i.eps,i.net_income/NULLIF(b.shares_outstanding,0)) AS eps
 FROM market.financial_periods p JOIN market.income_statements i ON i.period_id=p.id LEFT JOIN market.balance_sheets b ON b.period_id=p.id
 AND `+reviewedComponentSQL("b", "p", "$4", "balance", "balance_sheets")+`
 WHERE p.security_id=s.id AND p.period_type='annual' AND ($5::int IS NULL OR p.fiscal_year=$5)
 AND p.period_end<=q.event_timestamp::date AND p.reported_at<=q.event_timestamp::date AND p.currency=s.currency
 AND `+reviewedComponentSQL("i", "p", "$4", "income", "income_statements")+`
 ORDER BY p.fiscal_year DESC,p.reported_at DESC LIMIT 1) f ON f.eps>0
 WHERE s.exchange=$1 AND c.sector_id=$2 AND s.id!=$3 AND s.status='active'
 AND q.last_price>0 AND q.event_timestamp<=now() AND q.event_timestamp>=now()-interval '7 days'`, exchange, sectorID, excludeID, s.AllowUnreviewed, fiscalYear).Scan(&result.AvgPE, &result.AvgDividendYield, &result.SampleSize)
	if err != nil {
		return nil, err
	}
	return result, nil
}

func scoreInput(raw json.RawMessage) (map[string]json.RawMessage, string, string, error) {
	var values map[string]json.RawMessage
	var id, asOf string
	if len(raw) > 1048576 || json.Unmarshal(raw, &values) != nil || json.Unmarshal(values["securityId"], &id) != nil || json.Unmarshal(values["asOf"], &asOf) != nil || id == "" || asOf == "" {
		return nil, "", "", errors.New("invalid sourced score record")
	}
	return values, id, asOf, nil
}

type scoreExecutor interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

func (s *Store) writeScore(ctx context.Context, table, id, asOf string, values map[string]json.RawMessage, fields []scoreField, inputs bool) error {
	return writeScoreOn(ctx, s.DB, table, id, asOf, values, fields, inputs)
}
func writeScoreOn(ctx context.Context, db scoreExecutor, table, id, asOf string, values map[string]json.RawMessage, fields []scoreField, inputs bool) error {
	if table != "computed_ratios" && table != "afri_scores" {
		return errors.New("invalid score table")
	}
	columns, parameters, updates := []string{"security_id", "as_of"}, []string{"$1", "$2"}, []string{"as_of=EXCLUDED.as_of"}
	args := []any{id, asOf}
	for _, field := range fields {
		var value *float64
		if raw := values[field.json]; raw != nil && json.Unmarshal(raw, &value) != nil {
			return errors.New("invalid numeric score value")
		}
		args = append(args, value)
		columns = append(columns, field.sql)
		parameters = append(parameters, fmt.Sprintf("$%d", len(args)))
		updates = append(updates, field.sql+"=EXCLUDED."+field.sql)
	}
	if inputs {
		raw := values["inputs"]
		if !json.Valid(raw) {
			return errors.New("invalid score evidence inputs")
		}
		args = append(args, string(raw))
		columns = append(columns, "inputs")
		parameters = append(parameters, fmt.Sprintf("$%d::jsonb", len(args)))
		updates = append(updates, "inputs=EXCLUDED.inputs")
	}
	_, err := db.ExecContext(ctx, `INSERT INTO market.`+table+` (`+strings.Join(columns, ",")+`) VALUES (`+strings.Join(parameters, ",")+`) ON CONFLICT(security_id) DO UPDATE SET `+strings.Join(updates, ","), args...)
	return err
}

var psColumn = regexp.MustCompile(`\bps\b`)

func (s *Store) UpsertRatios(ctx context.Context, raw json.RawMessage) error {
	values, id, asOf, err := scoreInput(raw)
	if err != nil {
		return err
	}
	err = s.writeScore(ctx, "computed_ratios", id, asOf, values, ratioFields, false)
	var pgError *pgconn.PgError
	if err == nil || !errors.As(err, &pgError) || pgError.Code != "42703" || !psColumn.MatchString(pgError.Message) {
		return err
	}
	// Only the additive PS column has a compatibility fallback. Never mask a
	// different missing column, database outage or invalid record.
	withoutPS := []scoreField{}
	for _, field := range ratioFields {
		if field.json != "ps" {
			withoutPS = append(withoutPS, field)
		}
	}
	return s.writeScore(ctx, "computed_ratios", id, asOf, values, withoutPS, false)
}
func (s *Store) UpsertAfriScore(ctx context.Context, raw json.RawMessage) error {
	values, id, asOf, err := scoreInput(raw)
	if err != nil {
		return err
	}
	return s.writeScore(ctx, "afri_scores", id, asOf, values, afriFields, true)
}

const researchBasisSQL = `SELECT md5(COALESCE((SELECT MAX(r.id)::text FROM market.filing_history_reviews r JOIN market.financial_periods p ON p.id=r.period_id
 WHERE p.security_id=$1 AND p.period_type='annual' AND p.period_end<=$2::timestamptz::date AND p.reported_at<=$2::timestamptz::date),'0')||':'||
 COALESCE((SELECT MAX(a.id)::text FROM market.financial_version_audit a JOIN market.financial_periods p ON p.id=a.period_id
 WHERE a.security_id=$1 AND p.security_id=$1 AND p.period_type='annual' AND p.period_end<=$2::timestamptz::date AND p.reported_at<=$2::timestamptz::date),'0'))`

func (s *Store) ResearchBasis(ctx context.Context, id, quoteAt string) (string, error) {
	var version string
	err := s.DB.QueryRowContext(ctx, researchBasisSQL, id, quoteAt).Scan(&version)
	return version, err
}

// Persist both derived records atomically, only while their quote and filing
// basis are still current. Native canonical publishers use the same issuer
// lock; a completed old computation cannot overwrite a newly published filing.
func (s *Store) PersistResearch(ctx context.Context, ratios, score json.RawMessage, expectedVersion string, expectedPrice float64) (bool, error) {
	marked, err := WithNativeResearchBasis(ratios, score, expectedVersion, expectedPrice)
	if err != nil {
		return false, err
	}
	score = marked
	r, id, at, err := scoreInput(ratios)
	if err != nil {
		return false, err
	}
	a, scoreID, scoreAt, err := scoreInput(score)
	if err != nil {
		return false, err
	}
	if id != scoreID || at != scoreAt || expectedVersion == "" {
		return false, errors.New("inconsistent research basis")
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, "canonical-research:"+id); err != nil {
		return false, err
	}
	var quoteMatches bool
	err = tx.QueryRowContext(ctx, `SELECT event_timestamp=$2::timestamptz AND last_price=$3 AND source<>'mock' AND event_timestamp<=now() FROM market.live_quotes WHERE security_id=$1 FOR SHARE`, id, at, expectedPrice).Scan(&quoteMatches)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if !quoteMatches {
		return false, nil
	}
	var version string
	if err = tx.QueryRowContext(ctx, researchBasisSQL, id, at).Scan(&version); err != nil {
		return false, err
	}
	if version != expectedVersion {
		return false, nil
	}
	if _, err = tx.ExecContext(ctx, "SAVEPOINT native_ratios"); err != nil {
		return false, err
	}
	err = writeScoreOn(ctx, tx, "computed_ratios", id, at, r, ratioFields, false)
	var pgError *pgconn.PgError
	if err != nil && errors.As(err, &pgError) && pgError.Code == "42703" && psColumn.MatchString(pgError.Message) {
		if _, err = tx.ExecContext(ctx, "ROLLBACK TO SAVEPOINT native_ratios"); err != nil {
			return false, err
		}
		fields := []scoreField{}
		for _, f := range ratioFields {
			if f.json != "ps" {
				fields = append(fields, f)
			}
		}
		err = writeScoreOn(ctx, tx, "computed_ratios", id, at, r, fields, false)
	}
	if err != nil {
		return false, err
	}
	if err = writeScoreOn(ctx, tx, "afri_scores", id, at, a, afriFields, true); err != nil {
		return false, err
	}
	if err = tx.Commit(); err != nil {
		return false, err
	}
	return true, nil
}
