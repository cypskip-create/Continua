package billing

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"
)

func (s *SQLStore) GetRenewal(ctx context.Context, userID, mode string) (json.RawMessage, error) {
	var raw []byte
	err := s.DB.QueryRowContext(ctx, `SELECT row_to_json(result) FROM (SELECT enabled,plan,to_char(next_charge_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "nextChargeAt",active_reference IS NOT NULL AS processing FROM public.paystack_card_renewals WHERE user_id=$1 AND mode=$2) result`, userID, mode).Scan(&raw)
	if err == sql.ErrNoRows {
		return json.RawMessage(`null`), nil
	}
	return json.RawMessage(raw), err
}
func (s *SQLStore) DisableRenewal(ctx context.Context, userID, mode string) error {
	_, err := s.DB.ExecContext(ctx, `UPDATE public.paystack_card_renewals SET enabled=false WHERE user_id=$1 AND mode=$2`, userID, mode)
	return err
}

func (s *SQLStore) DueRenewals(ctx context.Context, mode string) ([]RenewalCandidate, error) {
	if mode != "live" && mode != "test" {
		return nil, problem(400, "Invalid payment mode.")
	}
	rows, err := s.DB.QueryContext(ctx, `SELECT user_id,mode FROM public.paystack_card_renewals WHERE mode=$1 AND (active_reference IS NOT NULL OR (enabled AND next_charge_at<=now())) LIMIT 20`, mode)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []RenewalCandidate{}
	for rows.Next() {
		var c RenewalCandidate
		if err := rows.Scan(&c.UserID, &c.Mode); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}
func (s *SQLStore) ReserveRenewal(ctx context.Context, c RenewalCandidate) (*RenewalReservation, error) {
	if c.Mode != "live" && c.Mode != "test" {
		return nil, problem(400, "Invalid payment mode.")
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, "billing:"+c.Mode+":"+c.UserID); err != nil {
		return nil, err
	}
	var r RenewalReservation
	var plan, consent string
	var enabled bool
	var next time.Time
	var active sql.NullString
	err = tx.QueryRowContext(ctx, `SELECT user_id,mode,email,plan,authorization_cipher,consent_reference,enabled,next_charge_at,active_reference FROM public.paystack_card_renewals WHERE user_id=$1 AND mode=$2 FOR UPDATE`, c.UserID, c.Mode).Scan(&r.UserID, &r.Mode, &r.Email, &plan, &r.AuthorizationCipher, &consent, &enabled, &next, &active)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if active.Valid {
		r.Reference = active.String
		return &r, tx.Commit()
	}
	if !enabled || next.After(time.Now()) {
		return nil, nil
	}
	var tier sql.NullString
	err = tx.QueryRowContext(ctx, `SELECT public.effective_subscription_plan($1)`, r.UserID).Scan(&tier)
	if err != nil {
		return nil, err
	}
	if tier.String == "premium_plus" && plan == "premium" {
		if _, err = tx.ExecContext(ctx, `UPDATE public.paystack_card_renewals SET enabled=false WHERE user_id=$1 AND mode=$2`, r.UserID, r.Mode); err != nil {
			return nil, err
		}
		return nil, tx.Commit()
	}
	var exists bool
	if err = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM public.paystack_native_attempts WHERE user_id=$1 AND mode=$2 AND state IN ('creating','pending','unknown'))`, r.UserID, r.Mode).Scan(&exists); err != nil {
		return nil, err
	}
	if exists {
		return nil, nil
	}
	amount, err := PriceMinor(plan, "monthly")
	if err != nil {
		return nil, err
	}
	id, err := uuid()
	if err != nil {
		return nil, err
	}
	intent, err := uuid()
	if err != nil {
		return nil, err
	}
	r.Reference = "continua-" + r.Mode + "-" + id
	_, err = tx.ExecContext(ctx, `INSERT INTO public.paystack_native_attempts(reference,user_id,email,mode,plan,cycle,method,amount_minor,intent_id,request_hash) VALUES($1,$2,$3,$4,$5,'monthly','card',$6,$7,$8)`, r.Reference, r.UserID, r.Email, r.Mode, plan, amount, intent, "renewal:"+consent)
	if err != nil {
		return nil, err
	}
	if r.Mode == "live" {
		_, err = tx.ExecContext(ctx, `INSERT INTO public.paystack_live_orders(reference,user_id,email,plan,cycle,amount_minor,terms_version,terms_accepted_at) VALUES($1,$2,$3,$4,'monthly',$5,$6,now())`, r.Reference, r.UserID, r.Email, plan, amount, PolicyVersion)
	} else {
		_, err = tx.ExecContext(ctx, `INSERT INTO public.paystack_test_orders(reference,user_id,email,plan,cycle,amount_minor) VALUES($1,$2,$3,$4,'monthly',$5)`, r.Reference, r.UserID, r.Email, plan, amount)
	}
	if err != nil {
		return nil, err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE public.paystack_card_renewals SET active_reference=$3 WHERE user_id=$1 AND mode=$2`, r.UserID, r.Mode, r.Reference); err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	r.AmountMinor = amount
	r.Initiate = true
	return &r, nil
}
