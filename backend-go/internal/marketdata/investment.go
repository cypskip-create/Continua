package marketdata

import (
	"context"
	"encoding/json"
	"errors"
)

func (s *Store) InvestmentSimulations(ctx context.Context, owner string) ([]json.RawMessage, error) {
	return s.JSONRows(ctx, `SELECT row_to_json(result) FROM (SELECT id,name,kind,snapshot_id,created_at FROM market.investment_simulations WHERE user_id=$1 ORDER BY created_at DESC LIMIT 25) result`, owner)
}
func (s *Store) SaveInvestmentSimulation(ctx context.Context, owner, name, kind, snapshot string, configuration, result json.RawMessage) (json.RawMessage, error) {
	rows, e := s.JSONRows(ctx, `SELECT coalesce(market.save_investment_simulation($1,$2,$3,$4,$5::jsonb,$6::jsonb),'null'::jsonb)`, owner, name, kind, snapshot, string(configuration), string(result))
	if e != nil {
		return nil, e
	}
	if len(rows) != 1 {
		return nil, errors.New("simulation receipt unavailable")
	}
	return rows[0], nil
}

func (s *Store) InvestmentSimulation(ctx context.Context, owner, id string, remove bool) (json.RawMessage, error) {
	sql := `SELECT row_to_json(result) FROM (SELECT id,name,kind,snapshot_id,configuration,result,created_at FROM market.investment_simulations WHERE user_id=$1 AND id=$2) result`
	if remove {
		sql = `WITH removed AS (DELETE FROM market.investment_simulations WHERE user_id=$1 AND id=$2 RETURNING id) SELECT jsonb_build_object('deleted',true) FROM removed`
	}
	rows, e := s.JSONRows(ctx, sql, owner, id)
	if e != nil {
		return nil, e
	}
	if len(rows) == 0 {
		return nil, nil
	}
	return rows[0], nil
}
func (s *Store) InvestmentCoverage(ctx context.Context) ([]json.RawMessage, []json.RawMessage, error) {
	securities, e := s.JSONRows(ctx, `SELECT payload FROM market.investment_coverage_rows() payload`)
	if e != nil {
		return nil, nil, e
	}
	sources, e := s.JSONRows(ctx, `SELECT row_to_json(result) FROM (SELECT s.id,s.enabled,s.redistribution_allowed AS "redistributionAllowed",max(a.retrieved_at) AS "lastRetrieved",(SELECT count(*)::integer FROM scraping.dead_letters d WHERE d.source_id=s.id) AS "recordedFailures" FROM scraping.sources s LEFT JOIN scraping.raw_artifacts a ON a.source_id=s.id GROUP BY s.id ORDER BY s.id) result`)
	return securities, sources, e
}
func (s *Store) InvestmentEventPreferences(ctx context.Context, owner string, settings json.RawMessage) (json.RawMessage, error) {
	if len(settings) > 0 {
		rows, e := s.JSONRows(ctx, `WITH saved AS (INSERT INTO market.investment_event_preferences(user_id,enabled,held,watched,macro) VALUES($1,($2::jsonb->>'enabled')::boolean,($2::jsonb->>'held')::boolean,($2::jsonb->>'watched')::boolean,($2::jsonb->>'macro')::boolean) ON CONFLICT(user_id) DO UPDATE SET enabled=EXCLUDED.enabled,held=EXCLUDED.held,watched=EXCLUDED.watched,macro=EXCLUDED.macro,enabled_at=CASE WHEN EXCLUDED.enabled AND NOT investment_event_preferences.enabled THEN now() ELSE investment_event_preferences.enabled_at END RETURNING enabled,held,watched,macro) SELECT row_to_json(saved) FROM saved`, owner, string(settings))
		if e != nil {
			return nil, e
		}
		if len(rows) != 1 {
			return nil, errors.New("preference receipt missing")
		}
		return rows[0], nil
	}
	rows, e := s.JSONRows(ctx, `SELECT coalesce((SELECT jsonb_build_object('enabled',enabled,'held',held,'watched',watched,'macro',macro) FROM market.investment_event_preferences WHERE user_id=$1),jsonb_build_object('enabled',false,'held',true,'watched',true,'macro',false))`, owner)
	if e != nil {
		return nil, e
	}
	if len(rows) != 1 {
		return nil, errors.New("preference receipt missing")
	}
	return rows[0], nil
}

func (s *Store) InvestmentEvidence(ctx context.Context, kind, cutoff, symbol string) ([]json.RawMessage, error) {
	if kind == "event" {
		return s.JSONRows(ctx, `SELECT payload FROM market.investment_event_rows($1::date,NULLIF($2,'')) payload`, cutoff, symbol)
	}
	return s.JSONRows(ctx, `SELECT payload || jsonb_build_object('id',id,'date',observed_date::text,
 'availableAt',available_date::text,'sourceUrl',source_url,'retrievedAt',retrieved_at,'sha256',sha256)
 FROM (SELECT DISTINCT ON(natural_key,observed_date) * FROM market.investment_evidence
 WHERE kind=$1 AND available_date<=$2::date AND ($3='' OR security_id='NSE:'||$3)
 ORDER BY natural_key,observed_date,available_date DESC,ingested_at DESC,id DESC LIMIT 5000) evidence`, kind, cutoff, symbol)
}

func (s *Store) InvestmentEventSymbols(ctx context.Context, owner, scope string) ([]string, error) {
	statement := `SELECT to_json(upper(symbol)) FROM public.watchlists WHERE user_id=$1 GROUP BY upper(symbol)`
	if scope == "held" {
		statement = `SELECT to_json(upper(symbol)) FROM public.portfolios WHERE user_id=$1 GROUP BY upper(symbol) HAVING sum(shares)>0`
	}
	rows, e := s.JSONRows(ctx, statement, owner)
	if e != nil {
		return nil, e
	}
	symbols := []string{}
	for _, raw := range rows {
		var symbol string
		if json.Unmarshal(raw, &symbol) != nil {
			return nil, errors.New("invalid event scope")
		}
		symbols = append(symbols, symbol)
	}
	return symbols, nil
}
