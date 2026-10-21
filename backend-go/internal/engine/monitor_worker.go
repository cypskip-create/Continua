package engine

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/url"
	"time"
)

type MonitorBundles interface {
	Bundle(context.Context, string, string) (json.RawMessage, error)
}
type MonitorWorker struct {
	DB      *sql.DB
	Bundles MonitorBundles
	Worker  CalculationWorker
	Now     func() time.Time
}
type MonitorSummary struct{ Checked, Failed int }
type monitorIdentity struct{ ID, UserID, Symbol, Exchange string }

func (s *MonitorWorker) Check(ctx context.Context, owner, symbol, exchange string) error {
	result, err := s.Run(ctx, &owner, &symbol, &exchange)
	if err == nil && result.Failed > 0 {
		return errors.New("monitor inputs unavailable")
	}
	return err
}

func (s *MonitorWorker) Run(ctx context.Context, userID, symbol, exchange *string) (MonitorSummary, error) {
	summary := MonitorSummary{}
	if s.DB == nil || s.Bundles == nil || s.Worker == nil {
		return summary, errors.New("monitor runtime unavailable")
	}
	rows, err := s.DB.QueryContext(ctx, `SELECT r.id::text,r.user_id::text,r.symbol,r.exchange FROM market.engine_monitor_rules r
 JOIN public.profiles p ON p.user_id=r.user_id WHERE r.enabled AND public.effective_subscription_plan(p.user_id)='premium_plus'
 AND ($1::text IS NULL OR r.user_id::text=$1) AND ($2::text IS NULL OR r.symbol=$2) AND ($3::text IS NULL OR r.exchange=$3)
 ORDER BY r.created_at,r.id LIMIT 500`, userID, symbol, exchange)
	if err != nil {
		return summary, err
	}
	identities := []monitorIdentity{}
	for rows.Next() {
		var id monitorIdentity
		if err := rows.Scan(&id.ID, &id.UserID, &id.Symbol, &id.Exchange); err != nil {
			rows.Close()
			return summary, err
		}
		identities = append(identities, id)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return summary, err
	}
	for _, id := range identities {
		if err := ctx.Err(); err != nil {
			return summary, err
		}
		attempt, stop := context.WithTimeout(ctx, 40*time.Second)
		raw, err := s.Bundles.Bundle(attempt, id.Symbol, id.Exchange)
		if err == nil {
			err = s.evaluate(attempt, id, raw)
		}
		stop()
		summary.Checked++
		if err != nil {
			summary.Failed++
			cleanup, stop := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
			// Retain previous trigger/fingerprint so an outage cannot manufacture a
			// threshold crossing or material-change notification on recovery.
			_, _ = s.DB.ExecContext(cleanup, `UPDATE market.engine_monitor_rules SET last_state=COALESCE(last_state,'{}'::jsonb)||jsonb_build_object('checkedAt',now(),'error','Research inputs could not load. Previous state retained.') WHERE id=$1 AND user_id=$2`, id.ID, id.UserID)
			stop()
		}
	}
	var eventReady bool
	if s.DB.QueryRowContext(ctx, "SELECT to_regprocedure('market.deliver_investment_events(uuid)') IS NOT NULL").Scan(&eventReady) == nil && eventReady {
		if _, err := s.DB.ExecContext(ctx, "SELECT market.deliver_investment_events($1::uuid)", userID); err != nil {
			summary.Failed++
		}
	}
	return summary, nil
}
func (s *MonitorWorker) evaluate(ctx context.Context, id monitorIdentity, bundle json.RawMessage) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var rule json.RawMessage
	var notify bool
	// Entitlement and preference are rechecked within the delivery transaction;
	// a stale batch cannot send after cancellation or a concurrent rule deletion.
	err = tx.QueryRowContext(ctx, `SELECT json_build_object('kind',r.kind,'threshold',r.threshold,'last_state',r.last_state),
 CASE WHEN jsonb_typeof(pref.settings->'notifications')='boolean' THEN (pref.settings->>'notifications')::boolean ELSE true END
 FROM market.engine_monitor_rules r JOIN public.profiles p ON p.user_id=r.user_id
 LEFT JOIN public.engine_preferences pref ON pref.user_id=r.user_id
 WHERE r.id=$1 AND r.user_id=$2 AND r.enabled AND public.effective_subscription_plan(p.user_id)='premium_plus' FOR UPDATE OF r`, id.ID, id.UserID).Scan(&rule, &notify)
	if err == sql.ErrNoRows {
		return nil
	}
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	if s.Now != nil {
		now = s.Now().UTC()
	}
	raw, err := s.Worker.Calculate(ctx, Request{Operation: "monitor_evaluation", Args: []any{rule, bundle, now.Format("2006-01-02T15:04:05.000Z")}})
	if err != nil {
		return err
	}
	var result struct {
		State    json.RawMessage `json:"state"`
		EventKey string          `json:"eventKey"`
		Message  string          `json:"message"`
	}
	var state struct {
		Notify bool `json:"notify"`
	}
	if json.Unmarshal(raw, &result) != nil || json.Unmarshal(result.State, &state) != nil {
		return errors.New("invalid monitor calculation")
	}
	if state.Notify && notify {
		if result.EventKey == "" || len(result.EventKey) > 256 || len(result.Message) > 4000 {
			return errors.New("invalid monitor delivery")
		}
		var receipt string
		err = tx.QueryRowContext(ctx, `INSERT INTO market.engine_monitor_deliveries(rule_id,event_key) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING rule_id::text`, id.ID, result.EventKey).Scan(&receipt)
		if err != nil && err != sql.ErrNoRows {
			return err
		}
		if err == nil {
			var notice string
			err = tx.QueryRowContext(ctx, `INSERT INTO public.notifications(user_id,type,feature,title,message,action_url,entity_type) VALUES($1,'engine','engine',$2,$3,$4,'engine') RETURNING id::text`, id.UserID, id.Symbol+" research update", result.Message, "/engine?symbol="+url.QueryEscape(id.Symbol)).Scan(&notice)
			if err != nil {
				return err
			}
			if _, err = tx.ExecContext(ctx, `UPDATE market.engine_monitor_deliveries SET notification_id=$3 WHERE rule_id=$1 AND event_key=$2`, id.ID, result.EventKey, notice); err != nil {
				return err
			}
		}
	}
	if _, err = tx.ExecContext(ctx, `UPDATE market.engine_monitor_rules SET last_state=$2::jsonb WHERE id=$1`, id.ID, string(result.State)); err != nil {
		return err
	}
	return tx.Commit()
}
