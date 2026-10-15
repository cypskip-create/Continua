package marketdata

import (
	"context"
	"encoding/json"
	"errors"
	"math"
)

var ErrAIMonthlyBudget = errors.New("The Engine monthly AI budget is reached. Calculated research remains available.")
var ErrAIRequestLimit = errors.New("Research assistant request limit reached. Please retry later.")

// Accounting only: this code neither configures nor calls a paid provider.
func (s *Store) AIUsage(ctx context.Context, owner string) (json.RawMessage, error) {
	rows, e := s.JSONRows(ctx, `SELECT row_to_json(result) FROM (SELECT count(*)::int AS requests,COALESCE(sum(reserved_usd),0)::float8 AS reserved FROM market.engine_ai_usage WHERE user_id=$1 AND created_at>=date_trunc('month',now())) result`, owner)
	if e != nil {
		return nil, e
	}
	if len(rows) != 1 {
		return nil, errors.New("invalid AI usage aggregate")
	}
	return rows[0], nil
}

func (s *Store) ReserveAI(ctx context.Context, owner, model string, amount, monthlyCap float64, dailyLimit int) (string, error) {
	if owner == "" || model == "" || len(model) > 100 || amount < 0 || math.IsNaN(amount) || math.IsInf(amount, 0) || monthlyCap < 0 || monthlyCap > 1000 || math.IsNaN(monthlyCap) || math.IsInf(monthlyCap, 0) || dailyLimit < 0 || dailyLimit > 100 {
		return "", errors.New("invalid AI reservation")
	}
	tx, e := s.DB.BeginTx(ctx, nil)
	if e != nil {
		return "", e
	}
	defer tx.Rollback()
	if _, e = tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtext('engine-ai-budget'))`); e != nil {
		return "", e
	}
	var spent float64
	var daily, hourly int
	e = tx.QueryRowContext(ctx, `SELECT COALESCE(sum(reserved_usd) FILTER(WHERE created_at>=date_trunc('month',now())),0)::float8 AS spent,count(*) FILTER(WHERE user_id=$1 AND created_at>=date_trunc('day',now()))::int AS daily,count(*) FILTER(WHERE user_id=$1 AND created_at>now()-interval '1 hour')::int AS hourly FROM market.engine_ai_usage WHERE created_at>=LEAST(date_trunc('month',now()),now()-interval '1 day')`, owner).Scan(&spent, &daily, &hourly)
	if e != nil {
		return "", e
	}
	if spent+amount > monthlyCap {
		return "", ErrAIMonthlyBudget
	}
	if daily >= dailyLimit || hourly >= 5 {
		return "", ErrAIRequestLimit
	}
	var id string
	e = tx.QueryRowContext(ctx, `INSERT INTO market.engine_ai_usage(user_id,model,reserved_usd) VALUES($1,$2,$3) RETURNING id::text`, owner, model, amount).Scan(&id)
	if e != nil {
		return "", e
	}
	if e = tx.Commit(); e != nil {
		return "", e
	}
	return id, nil
}

func (s *Store) FinishAI(ctx context.Context, id, status string, input, output *int64) error {
	if id == "" || (status != "complete" && status != "failed") || (input != nil && *input < 0) || (output != nil && *output < 0) {
		return errors.New("invalid AI completion")
	}
	// A timeout does not prove the provider did no work: retain its reservation.
	_, e := s.DB.ExecContext(ctx, `UPDATE market.engine_ai_usage SET status=$2,input_tokens=$3,output_tokens=$4 WHERE id=$1`, id, status, input, output)
	return e
}
