package engine

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
)

var ErrInvalidPreferences = errors.New("Invalid Engine preferences")

type CalculationWorker interface {
	Calculate(context.Context, Request) (json.RawMessage, error)
}
type PreferenceRepository struct {
	DB     *sql.DB
	Worker CalculationWorker
}

func (p *PreferenceRepository) validate(ctx context.Context, raw json.RawMessage, fallback bool) (json.RawMessage, error) {
	if len(raw) == 0 {
		raw = json.RawMessage(`{}`)
	}
	if len(raw) > 65536 || !json.Valid(raw) {
		if !fallback {
			return nil, ErrInvalidPreferences
		}
		raw = json.RawMessage(`{}`)
	}
	response, err := p.Worker.Calculate(ctx, Request{Operation: "validate_preferences", Args: []any{raw}})
	if err != nil {
		return nil, err
	}
	var parsed struct {
		Valid    bool            `json:"valid"`
		Settings json.RawMessage `json:"settings"`
	}
	if json.Unmarshal(response, &parsed) != nil {
		return nil, errors.New("invalid preferences worker response")
	}
	if !parsed.Valid {
		if !fallback {
			return nil, ErrInvalidPreferences
		}
		return p.validate(ctx, json.RawMessage(`{}`), false)
	}
	if !json.Valid(parsed.Settings) {
		return nil, errors.New("invalid preferences worker response")
	}
	return parsed.Settings, nil
}
func (p *PreferenceRepository) Preferences(ctx context.Context, userID string) (json.RawMessage, error) {
	var raw []byte
	err := p.DB.QueryRowContext(ctx, `SELECT settings FROM public.engine_preferences WHERE user_id=$1`, userID).Scan(&raw)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}
	return p.validate(ctx, raw, true)
}
func (p *PreferenceRepository) SavePreferences(ctx context.Context, userID string, input json.RawMessage) (json.RawMessage, error) {
	saved, err := p.validate(ctx, input, false)
	if err != nil {
		return nil, err
	}
	return p.update(ctx, userID, func(existing json.RawMessage) (json.RawMessage, error) {
		var values map[string]json.RawMessage
		var old map[string]json.RawMessage
		if json.Unmarshal(saved, &values) != nil || json.Unmarshal(existing, &old) != nil {
			return nil, errors.New("invalid preferences")
		}
		// Browser forms are not authoritative for server-recorded interests.
		values["interests"] = old["interests"]
		return json.Marshal(values)
	})
}
func (p *PreferenceRepository) RecordInterest(ctx context.Context, userID, symbol, exchange string, reset bool) (json.RawMessage, error) {
	return p.update(ctx, userID, func(existing json.RawMessage) (json.RawMessage, error) {
		return p.Worker.Calculate(ctx, Request{Operation: "record_interest", Args: []any{existing, symbol, exchange, reset}})
	})
}
func (p *PreferenceRepository) update(ctx context.Context, userID string, change func(json.RawMessage) (json.RawMessage, error)) (json.RawMessage, error) {
	tx, err := p.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, "engine-preferences:"+userID); err != nil {
		return nil, err
	}
	var raw []byte
	err = tx.QueryRowContext(ctx, `SELECT settings FROM public.engine_preferences WHERE user_id=$1`, userID).Scan(&raw)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}
	existing, err := p.validate(ctx, raw, true)
	if err != nil {
		return nil, err
	}
	saved, err := change(existing)
	if err != nil {
		return nil, err
	}
	if !json.Valid(saved) {
		return nil, errors.New("invalid preferences")
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO public.engine_preferences(user_id,settings) VALUES($1,$2::jsonb) ON CONFLICT(user_id) DO UPDATE SET settings=EXCLUDED.settings,updated_at=now()`, userID, string(saved)); err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	return saved, nil
}
