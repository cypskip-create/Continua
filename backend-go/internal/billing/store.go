package billing

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"
)

type SQLStore struct{ DB *sql.DB }
type scanner interface{ Scan(...any) error }

const attemptColumns = `reference,user_id,email,mode,plan,cycle,amount_minor,method,state,intent_id,request_hash,access_code,auto_renew,enrollment_processed,created_at`

func scanAttempt(row scanner) (*Attempt, error) {
	a := new(Attempt)
	var code sql.NullString
	err := row.Scan(&a.Reference, &a.UserID, &a.Email, &a.Mode, &a.Plan, &a.Cycle, &a.AmountMinor, &a.Method, &a.State, &a.IntentID, &a.RequestHash, &code, &a.AutoRenew, &a.EnrollmentProcessed, &a.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if code.Valid {
		a.AccessCode = &code.String
	}
	return a, nil
}
func uuid() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	b[6] = (b[6] & 15) | 64
	b[8] = (b[8] & 63) | 128
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16]), nil
}
func (s *SQLStore) Reserve(ctx context.Context, r ReserveRequest) (Reservation, error) {
	var result Reservation
	if r.Mode != "live" && r.Mode != "test" {
		return result, problem(400, "Invalid payment mode.")
	}
	amount, err := PriceMinor(r.Input.Plan, r.Input.Cycle)
	if err != nil {
		return result, err
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return result, err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, "billing:"+r.Mode+":"+r.UserID); err != nil {
		return result, err
	}
	same, err := scanAttempt(tx.QueryRowContext(ctx, `SELECT `+attemptColumns+` FROM public.paystack_native_attempts WHERE user_id=$1 AND mode=$2 AND intent_id=$3`, r.UserID, r.Mode, r.Input.IntentID))
	if err != nil {
		return result, err
	}
	if same != nil {
		if same.RequestHash != r.Fingerprint {
			return result, problem(409, "This payment attempt has different details.")
		}
		result.Attempt = *same
		return result, tx.Commit()
	}
	active, err := scanAttempt(tx.QueryRowContext(ctx, `SELECT `+attemptColumns+` FROM public.paystack_native_attempts WHERE user_id=$1 AND mode=$2 AND state IN ('creating','pending','unknown')`, r.UserID, r.Mode))
	if err != nil {
		return result, err
	}
	if active != nil {
		result.Attempt = *active
		return result, tx.Commit()
	}
	var plan sql.NullString
	err = tx.QueryRowContext(ctx, `SELECT public.effective_subscription_plan($1)`, r.UserID).Scan(&plan)
	if err != nil && err != sql.ErrNoRows {
		return result, err
	}
	if !plan.Valid || plan.String == "" {
		return result, problem(409, "Create your membership profile before checkout.")
	}
	if plan.String == "premium_plus" && r.Input.Plan == "premium" {
		return result, problem(409, "Premium is already included in your active Premium Plus membership.")
	}
	id, err := uuid()
	if err != nil {
		return result, err
	}
	reference := "continua-" + r.Mode + "-" + id
	a, err := scanAttempt(tx.QueryRowContext(ctx, `INSERT INTO public.paystack_native_attempts
 (reference,user_id,email,mode,plan,cycle,method,amount_minor,intent_id,request_hash,auto_renew)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING `+attemptColumns, reference, r.UserID, r.Email, r.Mode, r.Input.Plan, r.Input.Cycle, r.Input.PaymentMethod, amount, r.Input.IntentID, r.Fingerprint, r.Input.AutoRenew))
	if err != nil {
		return result, err
	}
	if r.Mode == "live" {
		_, err = tx.ExecContext(ctx, `INSERT INTO public.paystack_live_orders(reference,user_id,email,plan,cycle,amount_minor,terms_version,terms_accepted_at) VALUES($1,$2,$3,$4,$5,$6,$7,now())`, reference, r.UserID, r.Email, r.Input.Plan, r.Input.Cycle, amount, PolicyVersion)
	} else {
		_, err = tx.ExecContext(ctx, `INSERT INTO public.paystack_test_orders(reference,user_id,email,plan,cycle,amount_minor) VALUES($1,$2,$3,$4,$5,$6)`, reference, r.UserID, r.Email, r.Input.Plan, r.Input.Cycle, amount)
	}
	if err != nil {
		return result, err
	}
	if err = tx.Commit(); err != nil {
		return result, err
	}
	return Reservation{Attempt: *a, Created: true}, nil
}
func (s *SQLStore) Initiated(ctx context.Context, ref string, code *string) error {
	_, err := s.DB.ExecContext(ctx, `UPDATE public.paystack_native_attempts SET state=CASE WHEN state='creating' THEN 'pending' ELSE state END,access_code=$2 WHERE reference=$1`, ref, code)
	return err
}
func (s *SQLStore) Unknown(ctx context.Context, ref string) error {
	_, err := s.DB.ExecContext(ctx, `UPDATE public.paystack_native_attempts SET state='unknown' WHERE reference=$1 AND state='creating'`, ref)
	return err
}
func (s *SQLStore) FindAttempt(ctx context.Context, ref, userID string) (*Attempt, error) {
	query := `SELECT ` + attemptColumns + ` FROM public.paystack_native_attempts WHERE reference=$1`
	args := []any{ref}
	if userID != "" {
		query += ` AND user_id=$2`
		args = append(args, userID)
	}
	return scanAttempt(s.DB.QueryRowContext(ctx, query, args...))
}
func (s *SQLStore) FulfillLive(ctx context.Context, o Order, t Transaction) (map[string]any, error) {
	if o.Mode != "live" || t.Status != "success" || t.PaidAt == nil {
		return nil, problem(409, "Invalid fulfillment.")
	}
	var raw []byte
	if err := s.DB.QueryRowContext(ctx, `SELECT public.fulfill_paystack_live_order($1,$2,$3::timestamptz)`, o.Reference, t.ID, *t.PaidAt).Scan(&raw); err != nil {
		return nil, err
	}
	var result map[string]any
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, err
	}
	return result, nil
}
func (s *SQLStore) RecordTestPaid(ctx context.Context, o Order, t Transaction) error {
	if o.Mode != "test" || t.Status != "success" {
		return problem(409, "Invalid test receipt.")
	}
	result, err := s.DB.ExecContext(ctx, `UPDATE public.paystack_test_orders SET status='paid',provider_transaction_id=$2,verified_at=now() WHERE reference=$1 AND (provider_transaction_id IS NULL OR provider_transaction_id=$2)`, o.Reference, t.ID)
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows != 1 {
		return problem(409, "Test transaction conflicts with the recorded receipt.")
	}
	return nil
}
func (s *SQLStore) Enroll(ctx context.Context, a Attempt, encrypted string, next time.Time) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var done bool
	err = tx.QueryRowContext(ctx, `SELECT enrollment_processed FROM public.paystack_native_attempts WHERE reference=$1 FOR UPDATE`, a.Reference).Scan(&done)
	if err == sql.ErrNoRows {
		return nil
	}
	if err != nil {
		return err
	}
	if done {
		return tx.Commit()
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO public.paystack_card_renewals(user_id,mode,email,plan,authorization_cipher,consent_reference,next_charge_at)
 VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(user_id,mode) DO UPDATE SET
 email=EXCLUDED.email,plan=EXCLUDED.plan,authorization_cipher=EXCLUDED.authorization_cipher,
 consent_reference=EXCLUDED.consent_reference,next_charge_at=EXCLUDED.next_charge_at,enabled=true
 WHERE (SELECT created_at FROM public.paystack_native_attempts WHERE reference=paystack_card_renewals.consent_reference) <= $8`, a.UserID, a.Mode, a.Email, a.Plan, encrypted, a.Reference, next, a.CreatedAt)
	if err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE public.paystack_native_attempts SET enrollment_processed=true WHERE reference=$1`, a.Reference); err != nil {
		return err
	}
	return tx.Commit()
}
func (s *SQLStore) Reconcile(ctx context.Context, a Attempt, state string, expiry *string) error {
	if state != "paid" && state != "failed" && state != "abandoned" && state != "reversed" {
		return nil
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var current string
	if err = tx.QueryRowContext(ctx, `SELECT state FROM public.paystack_native_attempts WHERE reference=$1 FOR UPDATE`, a.Reference).Scan(&current); err != nil {
		return err
	}
	if current == "paid" && state != "paid" {
		return tx.Commit()
	}
	if state == "paid" {
		if !a.AutoRenew && a.Mode == "live" && expiry != nil {
			_, err = tx.ExecContext(ctx, `UPDATE public.paystack_card_renewals SET enabled=CASE WHEN $3='annual' OR plan<>$4 THEN false ELSE enabled END,
 next_charge_at=greatest(next_charge_at,$5::timestamptz) WHERE user_id=$1 AND mode=$2 AND active_reference IS DISTINCT FROM $6`, a.UserID, a.Mode, a.Cycle, a.Plan, *expiry, a.Reference)
			if err != nil {
				return err
			}
		}
		next := NextMonth(time.Now()).Format(time.RFC3339Nano)
		if expiry != nil {
			next = *expiry
		}
		_, err = tx.ExecContext(ctx, `UPDATE public.paystack_card_renewals SET active_reference=NULL,next_charge_at=$2 WHERE active_reference=$1`, a.Reference, next)
	} else {
		_, err = tx.ExecContext(ctx, `UPDATE public.paystack_card_renewals SET active_reference=NULL,enabled=false WHERE active_reference=$1`, a.Reference)
	}
	if err != nil {
		return err
	}
	// A delayed pending/failed verification must never demote an already-paid
	// reservation. Fulfillment itself remains the authoritative SQL guarantee.
	_, err = tx.ExecContext(ctx, `UPDATE public.paystack_native_attempts SET state=$2 WHERE reference=$1 AND (state<>'paid' OR $2='paid')`, a.Reference, state)
	if err != nil {
		return err
	}
	return tx.Commit()
}
