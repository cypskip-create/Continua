package engine

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"
)

type Notebook struct {
	DB     *sql.DB
	Worker CalculationWorker
	Now    func() time.Time
}
type NotebookError struct {
	Status  int
	Message string
}

func (e *NotebookError) Error() string { return e.Message }
func (s *Notebook) now() time.Time {
	if s.Now != nil {
		return s.Now().UTC()
	}
	return time.Now().UTC()
}

const notebookJSON = `to_jsonb(n)||jsonb_build_object('deadline',to_char(n.deadline AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'created_at',to_char(n.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'resolved_at',to_char(n.resolved_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))`

func (s *Notebook) List(ctx context.Context, owner string) (json.RawMessage, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT `+notebookJSON+` FROM market.engine_forecast_notebook n WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`, owner)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []json.RawMessage{}
	size := 0
	for rows.Next() {
		var raw json.RawMessage
		if err := rows.Scan(&raw); err != nil {
			return nil, err
		}
		size += len(raw)
		if size > 2*1024*1024 {
			return nil, errors.New("notebook response budget")
		}
		items = append(items, raw)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rows.Close()
	calibration, err := s.Worker.Calculate(ctx, Request{Operation: "private_calibration", Args: []any{items}})
	if err != nil {
		return nil, err
	}
	return json.Marshal(map[string]any{"forecasts": items, "calibration": calibration})
}
func (s *Notebook) Mutate(ctx context.Context, owner, id, action string, raw json.RawMessage) (json.RawMessage, error) {
	if action != "create" && action != "revise" && action != "resolve" {
		return nil, &NotebookError{400, "Invalid forecast action"}
	}
	at := s.now()
	now := at.Format("2006-01-02T15:04:05.000Z")
	valid, err := s.Worker.Calculate(ctx, Request{Operation: "validate_forecast", Args: []any{action, raw, now}})
	if err != nil {
		return nil, err
	}
	var result struct {
		Valid bool `json:"valid"`
		Data  struct {
			Symbol, Question, Rules, Deadline, Rationale, Outcome, SourceURL, Note string
			Probability                                                            float64
		} `json:"data"`
	}
	if json.Unmarshal(valid, &result) != nil || !result.Valid {
		return nil, &NotebookError{400, "Invalid forecast input"}
	}
	b := result.Data
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var saved json.RawMessage
	if action == "create" {
		if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, "forecast-notebook:"+owner); err != nil {
			return nil, err
		}
		var count int
		if err := tx.QueryRowContext(ctx, `SELECT count(*)::int FROM market.engine_forecast_notebook WHERE user_id=$1`, owner).Scan(&count); err != nil {
			return nil, err
		}
		if count >= 100 {
			return nil, &NotebookError{400, "Maximum 100 private research questions per account."}
		}
		var security string
		err = tx.QueryRowContext(ctx, `SELECT id FROM market.securities WHERE id=$1 AND status='active'`, "NSE:"+b.Symbol).Scan(&security)
		if err == sql.ErrNoRows {
			return nil, &NotebookError{400, "Select an active NSE company."}
		}
		if err != nil {
			return nil, err
		}
		// The account lock may have waited until the deadline. Revalidate now.
		deadline, err := time.Parse(time.RFC3339Nano, b.Deadline)
		if err != nil || !deadline.After(s.now()) {
			return nil, &NotebookError{409, "Forecast deadline has passed."}
		}
		now = s.now().Format("2006-01-02T15:04:05.000Z")
		revisions, _ := json.Marshal([]any{map[string]any{"at": now, "probability": b.Probability, "rationale": b.Rationale}})
		err = tx.QueryRowContext(ctx, `WITH saved AS (INSERT INTO market.engine_forecast_notebook(user_id,security_id,symbol,question,rules,deadline,probability,revisions) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING *) SELECT `+notebookJSON+` FROM saved n`, owner, security, b.Symbol, b.Question, b.Rules, b.Deadline, b.Probability, string(revisions)).Scan(&saved)
	} else {
		var status string
		var deadline time.Time
		var revisions json.RawMessage
		err = tx.QueryRowContext(ctx, `SELECT status,deadline,revisions FROM market.engine_forecast_notebook WHERE id=$1 AND user_id=$2 FOR UPDATE`, id, owner).Scan(&status, &deadline, &revisions)
		if err == sql.ErrNoRows {
			return nil, &NotebookError{404, "Research question not found."}
		}
		if err != nil {
			return nil, err
		}
		at = s.now()
		now = at.Format("2006-01-02T15:04:05.000Z")
		if action == "revise" {
			if status != "open" || !deadline.After(at) {
				return nil, &NotebookError{409, "Probability revisions close at the deadline; resolved questions cannot change."}
			}
			var history []json.RawMessage
			if json.Unmarshal(revisions, &history) != nil || history == nil {
				return nil, errors.New("invalid forecast history")
			}
			if len(history) >= 100 {
				return nil, &NotebookError{400, "Maximum 100 revisions per question."}
			}
			revision, _ := json.Marshal(map[string]any{"at": now, "probability": b.Probability, "rationale": b.Rationale})
			history = append(history, revision)
			updated, _ := json.Marshal(history)
			err = tx.QueryRowContext(ctx, `WITH saved AS (UPDATE market.engine_forecast_notebook SET probability=$1,revisions=$2::jsonb WHERE id=$3 AND user_id=$4 RETURNING *) SELECT `+notebookJSON+` FROM saved n`, b.Probability, string(updated), id, owner).Scan(&saved)
		} else {
			if status != "open" || deadline.After(at) {
				return nil, &NotebookError{409, "Resolve only after the deadline. Resolution cannot be edited."}
			}
			state := "resolved"
			var outcome any = b.Outcome == "yes"
			if b.Outcome == "void" {
				state = "void"
				outcome = nil
			}
			err = tx.QueryRowContext(ctx, `WITH saved AS (UPDATE market.engine_forecast_notebook SET status=$1,outcome=$2,resolution_source=$3,resolution_note=$4,resolved_at=now() WHERE id=$5 AND user_id=$6 RETURNING *) SELECT `+notebookJSON+` FROM saved n`, state, outcome, b.SourceURL, b.Note, id, owner).Scan(&saved)
		}
	}
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return saved, nil
}
