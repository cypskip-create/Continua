package marketdata

import (
	"context"
	"encoding/json"
	"errors"
)

// Explicit native SQL readers/writers; no compatibility-service forwarding.
func (s *Store) InstitutionalRead(ctx context.Context, kind, owner, key string) ([]json.RawMessage, error) {
	switch kind {
	case "models":
		return s.JSONRows(ctx, `SELECT row_to_json(r) FROM(SELECT id,version,status,definition FROM market.quantitative_models ORDER BY id,version)r`)
	case "legacy-model":
		return s.JSONRows(ctx, `SELECT jsonb_build_object('status',status) FROM market.quantitative_models WHERE id=$1 AND version='investment-intelligence-v1'`, key)
	case "model":
		return s.JSONRows(ctx, `SELECT jsonb_build_object('status',status) FROM market.quantitative_models WHERE id=$1 AND version='institutional-intelligence-v1'`, key)
	case "security":
		return s.JSONRows(ctx, `SELECT jsonb_build_object('symbol',symbol,'currency',currency,'status',status) FROM market.securities WHERE exchange='NSE' AND symbol=$1`, key)
	case "held":
		return s.JSONRows(ctx, `SELECT jsonb_build_object('symbol',upper(symbol),'quantity',sum(shares)::float8) FROM public.portfolios WHERE user_id=$1 GROUP BY upper(symbol) HAVING sum(shares)>0 ORDER BY upper(symbol)`, owner)
	case "financials":
		return s.JSONRows(ctx, `SELECT payload FROM market.canonical_financial_history($1,'annual',10,false) payload`, "NSE:"+key)
	case "snapshots":
		return s.JSONRows(ctx, `SELECT jsonb_build_object('inputHash',input_hash,'name',name,'createdAt',created_at) FROM market.quantitative_snapshots WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10`, owner)
	case "snapshot":
		return s.JSONRows(ctx, `SELECT jsonb_build_object('inputHash',s.input_hash,'name',s.name,'createdAt',s.created_at,'configuration',s.configuration||d.payload,'result',s.result) FROM market.quantitative_snapshots s JOIN market.quantitative_datasets d ON d.user_id=s.user_id AND d.data_hash=s.data_hash WHERE s.user_id=$1 AND s.input_hash=$2`, owner, key)
	case "delete-snapshot":
		return s.JSONRows(ctx, `SELECT receipt FROM(SELECT market.delete_quantitative_snapshot($1,$2) receipt) removed WHERE receipt IS NOT NULL`, owner, key)
	case "dashboard":
		return s.JSONRows(ctx, `SELECT payload FROM market.quantitative_dashboard() payload`)
	case "pending-relationships":
		return s.JSONRows(ctx, `SELECT row_to_json(r) FROM(SELECT e.*,a.document_url AS source_url FROM market.exposure_relationships e JOIN scraping.raw_artifacts a ON a.id=e.artifact_id WHERE verification='pending' ORDER BY ingested_at LIMIT 100)r`)
	}
	return nil, errors.New("unknown institutional read")
}
func (s *Store) InstitutionalGraph(ctx context.Context, cutoff string, symbol *string) ([]json.RawMessage, error) {
	return s.JSONRows(ctx, `SELECT payload FROM market.institutional_graph_rows($1::date,$2) payload`, cutoff, symbol)
}
func (s *Store) InstitutionalRecord(ctx context.Context, owner, model, version, hash, state string, summary json.RawMessage, milliseconds int64) error {
	_, e := s.DB.ExecContext(ctx, `SELECT market.record_quantitative_run($1,$2,$3,$4,$5,$6::jsonb,$7)`, owner, model, version, hash, state, string(summary), milliseconds)
	return e
}
func (s *Store) InstitutionalSave(ctx context.Context, owner, title, hash string, input, output json.RawMessage) (json.RawMessage, error) {
	rows, e := s.JSONRows(ctx, `SELECT coalesce(market.save_quantitative_snapshot($1,$2,$3,$4::jsonb,$5::jsonb),'null'::jsonb)`, owner, title, hash, string(input), string(output))
	if e != nil {
		return nil, e
	}
	if len(rows) != 1 {
		return nil, errors.New("snapshot receipt unavailable")
	}
	return rows[0], nil
}
func (s *Store) InstitutionalAdmin(ctx context.Context, operation, id string, input json.RawMessage) ([]json.RawMessage, error) {
	var p struct {
		Version      string `json:"version"`
		Status       string `json:"status"`
		Verification string `json:"verification"`
		Note         string `json:"note"`
	}
	if json.Unmarshal(input, &p) != nil {
		return nil, errors.New("invalid admin input")
	}
	if operation == "model-status" {
		return s.JSONRows(ctx, `UPDATE market.quantitative_models SET status=$1 WHERE id=$2 AND version=$3 RETURNING jsonb_build_object('id',id,'version',version,'status',status)`, p.Status, id, p.Version)
	}
	if operation == "review-relationship" {
		return s.JSONRows(ctx, `UPDATE market.exposure_relationships e SET verification=$1,reviewed_at=now(),review_note=$2 FROM scraping.raw_artifacts a JOIN scraping.sources s ON s.id=a.source_id WHERE e.id=$3 AND e.artifact_id=a.id AND ($1='rejected' OR s.enabled AND s.redistribution_allowed=true AND length(trim(s.config->>'permissionReference')) BETWEEN 1 AND 200) RETURNING jsonb_build_object('id',e.id,'verification',e.verification)`, p.Verification, p.Note, id)
	}
	return nil, errors.New("unknown institutional admin action")
}
