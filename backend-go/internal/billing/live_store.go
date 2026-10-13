package billing

import (
	"context"
	"database/sql"
)

func (s *SQLStore) CreateLive(ctx context.Context, userID, email string, a Agreement) (Order, error) {
	var result Order
	amount, e := PriceMinor(a.Plan, a.Cycle)
	if e != nil {
		return result, e
	}
	var plan sql.NullString
	e = s.DB.QueryRowContext(ctx, `SELECT public.effective_subscription_plan($1)`, userID).Scan(&plan)
	if e != nil && e != sql.ErrNoRows {
		return result, e
	}
	if !plan.Valid {
		return result, problem(409, "Create your membership profile before checkout.")
	}
	if plan.String == "premium_plus" && a.Plan == "premium" {
		return result, problem(409, "Premium is already included in your active Premium Plus membership. Renew Plus or wait until it expires to switch.")
	}
	id, e := uuid()
	if e != nil {
		return result, e
	}
	ref := "continua-live-" + id
	_, e = s.DB.ExecContext(ctx, `INSERT INTO public.paystack_live_orders(reference,user_id,email,plan,cycle,amount_minor,terms_version,terms_accepted_at) VALUES($1,$2,$3,$4,$5,$6,$7,now())`, ref, userID, email, a.Plan, a.Cycle, amount, PolicyVersion)
	if e != nil {
		return result, e
	}
	policy := PolicyVersion
	return Order{Reference: ref, Mode: "live", UserID: userID, Email: email, Plan: a.Plan, Cycle: a.Cycle, AmountMinor: amount, TermsVersion: &policy}, nil
}
func (s *SQLStore) FindLive(ctx context.Context, ref, userID string) (*Order, error) {
	query := `SELECT reference,user_id,email,plan,cycle,amount_minor,terms_version FROM public.paystack_live_orders WHERE reference=$1`
	args := []any{ref}
	if userID != "" {
		query += ` AND user_id=$2`
		args = append(args, userID)
	}
	o := new(Order)
	var policy sql.NullString
	e := s.DB.QueryRowContext(ctx, query, args...).Scan(&o.Reference, &o.UserID, &o.Email, &o.Plan, &o.Cycle, &o.AmountMinor, &policy)
	if e == sql.ErrNoRows {
		return nil, nil
	}
	if e != nil {
		return nil, e
	}
	o.Mode = "live"
	if policy.Valid {
		o.TermsVersion = &policy.String
	}
	return o, nil
}
