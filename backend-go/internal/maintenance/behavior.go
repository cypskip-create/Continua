package maintenance

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"time"
)

// These are native implementations of the existing operator workflows, not
// startup jobs. Fixtures run only inside an explicitly requested migration
// transaction and are rolled back even when the migration itself is committed.
func migrationBehavior(ctx context.Context, tx *sql.Tx, version string) error {
	if version != "20261012030000" && version != "20261012011000" && version != "20261010210000" {
		return nil
	}
	if _, err := tx.ExecContext(ctx, "SAVEPOINT native_operator_fixture"); err != nil {
		return err
	}
	var err error
	switch version {
	case "20261012030000":
		err = communityBehavior(ctx, tx)
	case "20261010210000":
		err = billingLedgerBehavior(ctx, tx)
	default:
		err = financialAuditBehavior(ctx, tx)
	}
	if err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, "ROLLBACK TO SAVEPOINT native_operator_fixture"); err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, "RELEASE SAVEPOINT native_operator_fixture")
	return err
}

func fixtureUUID() (string, error) {
	var value [16]byte
	if _, err := rand.Read(value[:]); err != nil {
		return "", err
	}
	value[6] = (value[6] & 15) | 64
	value[8] = (value[8] & 63) | 128
	return fmt.Sprintf("%x-%x-%x-%x-%x", value[:4], value[4:6], value[6:8], value[8:10], value[10:]), nil
}

func probeBool(ctx context.Context, tx *sql.Tx, query string, args ...any) error {
	var allowed bool
	if err := tx.QueryRowContext(ctx, query, args...).Scan(&allowed); err != nil {
		return err
	}
	if !allowed {
		return errors.New("registered operator behavior requirement failed")
	}
	return nil
}

func probeDenied(ctx context.Context, tx *sql.Tx, query string, args ...any) error {
	if _, err := tx.ExecContext(ctx, "SAVEPOINT native_denied_fixture"); err != nil {
		return err
	}
	_, denied := tx.ExecContext(ctx, query, args...)
	if _, err := tx.ExecContext(ctx, "ROLLBACK TO SAVEPOINT native_denied_fixture"); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "RELEASE SAVEPOINT native_denied_fixture"); err != nil {
		return err
	}
	if denied == nil {
		return errors.New("registered owner/interaction denial was not enforced")
	}
	return nil
}

func fixtureUser(ctx context.Context, tx *sql.Tx, id string) error {
	if _, err := tx.ExecContext(ctx, "RESET ROLE"); err != nil {
		return err
	}
	claims, _ := json.Marshal(map[string]string{"sub": id, "role": "authenticated"})
	if _, err := tx.ExecContext(ctx, "SELECT set_config('request.jwt.claims',$1,true)", string(claims)); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, "SET LOCAL ROLE authenticated")
	return err
}

func communityBehavior(ctx context.Context, tx *sql.Tx) error {
	ids := make([]string, 4)
	for i := range ids {
		var err error
		ids[i], err = fixtureUUID()
		if err != nil {
			return err
		}
	}
	a, b, c, post := ids[0], ids[1], ids[2], ids[3]
	for _, id := range ids[:3] {
		if _, err := tx.ExecContext(ctx, `INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,'{"full_name":"Native safety migration fixture"}'::jsonb)`, id, "native-safety-"+id+"@example.invalid"); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO public.posts(id,user_id,content) VALUES($1,$2,'Synthetic native migration fixture')`, post, b); err != nil {
		return err
	}
	if err := fixtureUser(ctx, tx, a); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO public.user_follows(follower_id,following_id) VALUES($1,$2)`, a, b); err != nil {
		return err
	}
	for _, detail := range []string{"Synthetic probe", "Retry"} {
		if _, err := tx.ExecContext(ctx, `SELECT public.community_submit_report('post',$1,'Spam or scam',$2)`, post, detail); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `SELECT public.community_submit_report('user',$1,'Harassment or hate','Synthetic probe')`, b); err != nil {
		return err
	}
	if err := probeDenied(ctx, tx, `SELECT public.community_submit_report('user',$1,'Other','')`, a); err != nil {
		return err
	}
	for i := 0; i < 2; i++ {
		if _, err := tx.ExecContext(ctx, `SELECT public.community_set_safety($1,'block',true)`, b); err != nil {
			return err
		}
	}
	if err := probeBool(ctx, tx, `SELECT NOT EXISTS(SELECT 1 FROM public.posts WHERE id=$1)`, post); err != nil {
		return err
	}
	for _, probe := range []struct {
		query string
		args  []any
	}{
		{`INSERT INTO public.post_reactions(post_id,user_id,reaction) VALUES($1,$2,'bullish')`, []any{post, a}},
		{`INSERT INTO public.post_comments(post_id,user_id,content) VALUES($1,$2,'Blocked fixture')`, []any{post, a}},
		{`INSERT INTO public.user_follows(follower_id,following_id) VALUES($1,$2)`, []any{a, b}},
	} {
		if err := probeDenied(ctx, tx, probe.query, probe.args...); err != nil {
			return err
		}
	}
	if err := fixtureUser(ctx, tx, b); err != nil {
		return err
	}
	if err := probeBool(ctx, tx, `SELECT NOT public.community_can_interact($1)`, a); err != nil {
		return err
	}
	if err := fixtureUser(ctx, tx, c); err != nil {
		return err
	}
	if err := probeBool(ctx, tx, `SELECT NOT EXISTS(SELECT 1 FROM public.account_reports)`); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "RESET ROLE"); err != nil {
		return err
	}
	if err := probeBool(ctx, tx, `SELECT count(*)=1 FROM public.post_reports WHERE post_id=$1`, post); err != nil {
		return err
	}
	if err := probeBool(ctx, tx, `SELECT NOT EXISTS(SELECT 1 FROM public.user_follows WHERE follower_id=$1 AND following_id=$2)`, a, b); err != nil {
		return err
	}
	if err := fixtureUser(ctx, tx, a); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `SELECT public.community_set_safety($1,'block',false)`, b); err != nil {
		return err
	}
	if err := probeBool(ctx, tx, `SELECT count(*)=1 FROM public.posts WHERE id=$1`, post); err != nil {
		return err
	}
	for _, enabled := range []bool{true, false} {
		if _, err := tx.ExecContext(ctx, `SELECT public.community_set_safety($1,'mute',$2)`, b, enabled); err != nil {
			return err
		}
	}
	return nil
}

func financialAuditBehavior(ctx context.Context, tx *sql.Tx) error {
	var before, after int64
	if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM market.financial_version_audit WHERE transaction_id=txid_current()`).Scan(&before); err != nil {
		return err
	}
	result, err := tx.ExecContext(ctx, `UPDATE market.income_statements SET eps=COALESCE(eps,0)+1 WHERE period_id=(SELECT period_id FROM market.income_statements ORDER BY period_id LIMIT 1)`)
	if err != nil {
		return err
	}
	changed, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM market.financial_version_audit WHERE transaction_id=txid_current()`).Scan(&after); err != nil {
		return err
	}
	if after-before != changed {
		return errors.New("financial audit trigger behavior failed")
	}
	return nil
}

func billingLedgerBehavior(ctx context.Context, tx *sql.Tx) error {
	uid, err := fixtureUUID()
	if err != nil {
		return err
	}
	id1, err := fixtureUUID()
	if err != nil {
		return err
	}
	id2, err := fixtureUUID()
	if err != nil {
		return err
	}
	reference1, reference2 := "continua-live-"+id1, "continua-live-"+id2
	email := "native-billing-" + uid + "@example.invalid"
	if _, err := tx.ExecContext(ctx, `INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data) VALUES($1,'authenticated','authenticated',$2,'{}'::jsonb)`, uid, email); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO public.profiles(user_id,subscription_plan) VALUES($1,'free') ON CONFLICT(user_id) DO NOTHING`, uid); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO public.paystack_live_orders(reference,user_id,email,plan,cycle,amount_minor) VALUES($1,$2,$3,'premium_plus','annual',996000)`, reference1, uid, email); err != nil {
		return err
	}
	fulfill := func(reference string, transaction int64) (map[string]any, error) {
		var raw []byte
		if err := tx.QueryRowContext(ctx, `SELECT public.fulfill_paystack_live_order($1,$2,now())`, reference, transaction).Scan(&raw); err != nil {
			return nil, err
		}
		var receipt map[string]any
		if json.Unmarshal(raw, &receipt) != nil {
			return nil, errors.New("invalid billing fixture receipt")
		}
		return receipt, nil
	}
	first, err := fulfill(reference1, 900000000001)
	if err != nil {
		return err
	}
	retry, err := fulfill(reference1, 900000000001)
	if err != nil {
		return err
	}
	if !reflect.DeepEqual(first, retry) {
		return errors.New("payment retry changed membership receipt")
	}
	if err := probeBool(ctx, tx, `SELECT subscription_plan='premium_plus' AND subscription_expires_at>now()+interval '364 days' FROM public.profiles WHERE user_id=$1`, uid); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO public.paystack_live_orders(reference,user_id,email,plan,cycle,amount_minor) VALUES($1,$2,$3,'premium_plus','monthly',100000)`, reference2, uid, email); err != nil {
		return err
	}
	renewal, err := fulfill(reference2, 900000000002)
	if err != nil {
		return err
	}
	firstExpiry, ok1 := first["expiresAt"].(string)
	nextExpiry, ok2 := renewal["expiresAt"].(string)
	firstAt, err1 := time.Parse(time.RFC3339Nano, firstExpiry)
	nextAt, err2 := time.Parse(time.RFC3339Nano, nextExpiry)
	if !ok1 || !ok2 || err1 != nil || err2 != nil || !nextAt.After(firstAt) {
		return errors.New("membership renewal failed to extend existing term")
	}
	if _, err := tx.ExecContext(ctx, `UPDATE public.profiles SET subscription_expires_at=now()-interval '1 second' WHERE user_id=$1`, uid); err != nil {
		return err
	}
	return probeBool(ctx, tx, `SELECT public.effective_subscription_plan($1)='free'`, uid)
}
