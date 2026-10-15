package engine

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"regexp"
)

type ObservationRepository struct {
	DB     *sql.DB
	Worker CalculationWorker
}

var evidenceHash = regexp.MustCompile(`^[a-f0-9]{64}$`)

func (p *ObservationRepository) Observe(ctx context.Context, securityID string, state json.RawMessage) (json.RawMessage, error) {
	if p.Worker == nil || len(state) > 1048576 || !json.Valid(state) {
		return nil, errors.New("invalid research state")
	}
	raw, err := p.Worker.Calculate(ctx, Request{Operation: "evidence_fingerprint", Args: []any{state}})
	if err != nil {
		return nil, err
	}
	var hash string
	if json.Unmarshal(raw, &hash) != nil || !evidenceHash.MatchString(hash) {
		return nil, errors.New("invalid evidence fingerprint")
	}
	tx, err := p.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, "engine-state:"+securityID); err != nil {
		return nil, err
	}
	rows, err := tx.QueryContext(ctx, `SELECT payload,fingerprint,to_char(captured_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') FROM market.engine_snapshots WHERE security_id=$1 ORDER BY captured_at DESC,id DESC LIMIT 2`, securityID)
	if err != nil {
		return nil, err
	}
	type snapshot struct {
		payload  json.RawMessage
		hash, at string
	}
	snapshots := []snapshot{}
	for rows.Next() {
		var s snapshot
		var payload []byte
		if err = rows.Scan(&payload, &s.hash, &s.at); err != nil {
			rows.Close()
			return nil, err
		}
		s.payload = payload
		snapshots = append(snapshots, s)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	// Use the persisted evidence hash. PostgreSQL JSONB reorders keys; hashing its
	// reserialized payload would falsely mark unchanged observations as new.
	same := len(snapshots) > 0 && snapshots[0].hash == hash
	var previous any
	var comparedAsOf any
	index := 0
	if same {
		index = 1
	}
	if index < len(snapshots) {
		previous = snapshots[index].payload
		comparedAsOf = snapshots[index].at
	}
	if !same {
		if _, err = tx.ExecContext(ctx, `INSERT INTO market.engine_snapshots(security_id,fingerprint,payload) VALUES($1,$2,$3::jsonb) ON CONFLICT(security_id,fingerprint) DO UPDATE SET captured_at=now()`, securityID, hash, string(state)); err != nil {
			return nil, err
		}
	}
	raw, err = p.Worker.Calculate(ctx, Request{Operation: "changes_between", Args: []any{previous, state}})
	if err != nil {
		return nil, err
	}
	var result map[string]json.RawMessage
	if json.Unmarshal(raw, &result) != nil || result["baseline"] == nil || result["changes"] == nil {
		return nil, errors.New("invalid research changes")
	}
	result["fingerprint"], _ = json.Marshal(hash)
	result["comparedAsOf"], _ = json.Marshal(comparedAsOf)
	output, err := json.Marshal(result)
	if err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	return output, nil
}
