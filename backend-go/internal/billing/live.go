package billing

import (
	"context"
	"encoding/json"
	"io"
	"net/url"
	"strings"
)

type Agreement struct {
	Plan          string  `json:"plan"`
	Cycle         string  `json:"cycle"`
	PolicyVersion string  `json:"policyVersion"`
	Accepted      bool    `json:"accepted"`
	PaymentMethod *string `json:"paymentMethod,omitempty"`
}

func DecodeAgreement(reader io.Reader) (Agreement, error) {
	var a Agreement
	raw, err := io.ReadAll(io.LimitReader(reader, 65537))
	if err != nil || len(raw) > 65536 {
		return a, problem(400, "Invalid billing agreement.")
	}
	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&a) != nil {
		return a, problem(400, "Invalid billing agreement.")
	}
	var trailing any
	if decoder.Decode(&trailing) != io.EOF {
		return a, problem(400, "Invalid billing agreement.")
	}
	var fields map[string]json.RawMessage
	_ = json.Unmarshal(raw, &fields)
	if value, ok := fields["paymentMethod"]; ok && strings.TrimSpace(string(value)) == "null" {
		return a, problem(400, "Invalid billing agreement.")
	}
	if _, err = PriceMinor(a.Plan, a.Cycle); err != nil || !a.Accepted || a.PolicyVersion != PolicyVersion {
		return a, problem(400, "Acknowledge the current checkout terms before proceeding.")
	}
	if a.PaymentMethod != nil && *a.PaymentMethod != "card" && *a.PaymentMethod != "mobile_money" {
		return a, problem(400, "Invalid payment method.")
	}
	return a, nil
}
func ValidCheckoutURL(value string) bool {
	u, e := url.Parse(value)
	return e == nil && u.Scheme == "https" && u.Hostname() == "checkout.paystack.com" && (u.Port() == "" || u.Port() == "443") && u.User == nil
}

// Preserve existing hosted orders for recovery; the in-page UI uses Initialize,
// not this legacy entrypoint. Removal requires an explicit API retirement.
type LiveStore interface {
	CreateLive(context.Context, string, string, Agreement) (Order, error)
	FindLive(context.Context, string, string) (*Order, error)
}

func (s *Service) InitializeLive(ctx context.Context, userID, email string, a Agreement) (map[string]any, error) {
	if !s.Config.LiveReady() {
		return nil, problem(503, "Live checkout is not configured. No payment has been taken.")
	}
	raw, _ := json.Marshal(a)
	a, e := DecodeAgreement(strings.NewReader(string(raw)))
	if e != nil {
		return nil, e
	}
	if !validEmail(email) {
		return nil, problem(400, "Your account needs an email address for checkout.")
	}
	store, ok := s.Store.(LiveStore)
	if !ok {
		return nil, problem(501, "Legacy checkout has not yet been migrated.")
	}
	order, e := store.CreateLive(ctx, userID, email, a)
	if e != nil {
		return nil, e
	}
	metadata, _ := json.Marshal(map[string]string{"continua_reference": order.Reference, "continua_user": userID, "mode": "live", "terms_version": PolicyVersion})
	body := map[string]any{"email": email, "amount": order.AmountMinor, "currency": "KES", "reference": order.Reference, "callback_url": s.Config.CallbackURL, "metadata": string(metadata)}
	if a.PaymentMethod != nil {
		body["channels"] = []string{*a.PaymentMethod}
	}
	raw, e = s.Provider.Call(ctx, "live", "/transaction/initialize", body)
	if e != nil {
		return nil, e
	}
	var result struct {
		URL        string  `json:"authorization_url"`
		Reference  string  `json:"reference"`
		AccessCode *string `json:"access_code"`
	}
	if json.Unmarshal(raw, &result) != nil || result.Reference != order.Reference || !ValidCheckoutURL(result.URL) || (result.AccessCode != nil && (len(*result.AccessCode) < 1 || len(*result.AccessCode) > 200)) {
		return nil, problem(502, "Payment provider returned an invalid checkout link.")
	}
	return map[string]any{"url": result.URL, "accessCode": result.AccessCode, "reference": order.Reference, "mode": "live", "amount": float64(order.AmountMinor) / 100, "currency": "KES"}, nil
}
func (s *Service) VerifyLive(ctx context.Context, ref, userID string) (map[string]any, error) {
	if !s.Config.LiveReady() {
		return nil, problem(503, "Live checkout is not configured. No payment has been taken.")
	}
	if !ValidReference(ref) || !strings.HasPrefix(ref, "continua-live-") {
		return nil, problem(400, "Invalid checkout reference.")
	}
	store, ok := s.Store.(LiveStore)
	if !ok {
		return nil, problem(501, "Legacy live payment recovery has not yet been migrated.")
	}
	order, e := store.FindLive(ctx, ref, userID)
	if e != nil {
		return nil, e
	}
	if order == nil {
		return nil, problem(404, "Checkout not found.")
	}
	raw, e := s.Provider.Call(ctx, "live", "/transaction/verify/"+ref, nil)
	if e != nil {
		return nil, e
	}
	t, e := ValidateTransaction(raw, *order)
	if e != nil {
		return nil, problem(409, "This payment does not match your live checkout.")
	}
	return s.liveReceipt(ctx, *order, t)
}
func (s *Service) liveReceipt(ctx context.Context, o Order, t Transaction) (map[string]any, error) {
	state := "pending"
	if t.Status == "success" {
		state = "paid"
	} else if t.Status == "failed" || t.Status == "abandoned" || t.Status == "reversed" {
		state = t.Status
	}
	receipt := map[string]any{"reference": o.Reference, "mode": "live", "status": state, "plan": o.Plan, "cycle": o.Cycle, "amount": float64(o.AmountMinor) / 100, "currency": "KES", "policyVersion": o.TermsVersion, "membershipChanged": false}
	if state == "paid" {
		entitlement, e := s.Store.FulfillLive(ctx, o, t)
		if e != nil {
			return nil, e
		}
		if len(entitlement) == 0 {
			return nil, problem(503, "Payment verified but membership activation needs another verification attempt. Do not pay again.")
		}
		receipt["membershipChanged"] = true
		for k, v := range entitlement {
			receipt[k] = v
		}
	}
	return receipt, nil
}
