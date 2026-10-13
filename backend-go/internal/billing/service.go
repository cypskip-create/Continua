package billing

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/mail"
	"net/url"
	"strings"
	"time"
)

type Config struct {
	Mode                                         string
	NativeEnabled, LiveEnabled, RenewalEnabled   bool
	CallbackURL, LiveKey, TestKey, EncryptionKey string
	TestUsers                                    map[string]bool
}

func (c Config) LiveReady() bool {
	u, err := url.Parse(c.CallbackURL)
	return c.LiveEnabled && strings.HasPrefix(c.LiveKey, "sk_live_") && err == nil && u.Scheme == "https" && u.Host != "" && u.User == nil
}
func (c Config) NativeForUser(id string) bool {
	return c.NativeEnabled && id != "" && ((c.Mode == "live" && c.LiveReady()) || (c.Mode == "test" && strings.HasPrefix(c.TestKey, "sk_test_") && c.TestUsers[id]))
}
func (c Config) RenewalReady() bool {
	_, err := authorizationCipher(c.EncryptionKey)
	return c.RenewalEnabled && err == nil && c.NativeEnabled && ((c.Mode == "live" && c.LiveReady()) || (c.Mode == "test" && strings.HasPrefix(c.TestKey, "sk_test_")))
}

type Attempt struct {
	Order
	Method, State, IntentID, RequestHash string
	AccessCode                           *string
	AutoRenew, EnrollmentProcessed       bool
	CreatedAt                            time.Time
}
type Reservation struct {
	Attempt Attempt
	Created bool
}
type ReserveRequest struct {
	UserID, Email, Mode, Fingerprint string
	Input                            CheckoutInput
}

// Reservation must commit both order records under the account advisory lock
// BEFORE a provider request. This is a durable boundary, not an in-memory lock.
type CheckoutStore interface {
	Reserve(context.Context, ReserveRequest) (Reservation, error)
	Initiated(context.Context, string, *string) error
	Unknown(context.Context, string) error
	FindAttempt(context.Context, string, string) (*Attempt, error)
	FulfillLive(context.Context, Order, Transaction) (map[string]any, error)
	RecordTestPaid(context.Context, Order, Transaction) error
	Reconcile(context.Context, Attempt, string, *string) error
	Enroll(context.Context, Attempt, string, time.Time) error
}
type Service struct {
	Config   Config
	Store    CheckoutStore
	Provider ProviderAPI
	Now      func() time.Time
	Warn     func(string)
}

func (s *Service) now() time.Time {
	if s.Now != nil {
		return s.Now().UTC()
	}
	return time.Now().UTC()
}
func validEmail(email string) bool {
	a, e := mail.ParseAddress(email)
	return e == nil && a.Address == email
}
func publicAttempt(a Attempt) map[string]any {
	var deadline any
	if a.Method != "card" {
		deadline = a.CreatedAt.UTC().Add(180 * time.Second).Format("2006-01-02T15:04:05.000Z")
	}
	return map[string]any{"reference": a.Reference, "mode": a.Mode, "plan": a.Plan, "cycle": a.Cycle, "amount": float64(a.AmountMinor) / 100, "currency": "KES", "accessCode": a.AccessCode, "paymentMethod": a.Method, "status": a.State, "authorizationDeadline": deadline}
}
func (s *Service) Initialize(ctx context.Context, userID, email string, input CheckoutInput) (map[string]any, error) {
	if !s.Config.NativeForUser(userID) {
		return nil, problem(503, "Native checkout is not enabled for this account. No payment has been initiated.")
	}
	// Revalidate at the service boundary; callers cannot bypass the HTTP decoder.
	raw, err := json.Marshal(input)
	if err != nil {
		return nil, problem(400, "Invalid checkout request.")
	}
	input, err = DecodeCheckout(strings.NewReader(string(raw)))
	if err != nil {
		return nil, problem(400, err.Error())
	}
	if !validEmail(email) {
		return nil, problem(400, "An account email is required.")
	}
	if input.AutoRenew && !s.Config.RenewalReady() {
		return nil, problem(503, "Card renewal is not enabled. Use a one-time payment.")
	}
	fingerprintRaw, _ := json.Marshal([]any{input.Plan, input.Cycle, input.PaymentMethod, input.Phone, input.AutoRenew})
	sum := sha256.Sum256(fingerprintRaw)
	reserved, err := s.Store.Reserve(ctx, ReserveRequest{userID, email, s.Config.Mode, hex.EncodeToString(sum[:]), input})
	if err != nil {
		return nil, err
	}
	a := reserved.Attempt
	if !reserved.Created {
		return publicAttempt(a), nil
	}
	metadata, _ := json.Marshal(map[string]string{"continua_reference": a.Reference, "continua_user": userID, "mode": a.Mode, "terms_version": PolicyVersion})
	body := map[string]any{"email": email, "amount": a.AmountMinor, "currency": "KES", "reference": a.Reference, "metadata": string(metadata)}
	path := "/charge"
	if a.Method == "card" {
		path = "/transaction/initialize"
		body["channels"] = []string{"card"}
		body["callback_url"] = s.Config.CallbackURL
	} else {
		provider := "mpesa"
		if a.Method == "airtel" {
			provider = "atl"
		}
		body["mobile_money"] = map[string]any{"phone": input.Phone, "provider": provider}
	}
	response, providerErr := s.Provider.Call(ctx, a.Mode, path, body)
	var result struct {
		Reference  string  `json:"reference"`
		AccessCode *string `json:"access_code"`
	}
	if providerErr == nil && (json.Unmarshal(response, &result) != nil || result.Reference != a.Reference || (result.AccessCode != nil && (len(*result.AccessCode) == 0 || len(*result.AccessCode) > 200)) || (a.Method == "card" && result.AccessCode == nil)) {
		providerErr = problem(502, "Unexpected payment initiation.")
	}
	// A request may time out after Paystack accepted it. Keep its reference and
	// never issue a replacement charge. A fresh bounded context records recovery
	// even if the caller disconnected during the provider call.
	persistCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	if providerErr != nil {
		a.State = "unknown"
		if err = s.Store.Unknown(persistCtx, a.Reference); err != nil {
			return nil, problem(503, "Payment initiation needs recovery. Check payment status; do not pay again.")
		}
	} else {
		a.State = "pending"
		a.AccessCode = result.AccessCode
		if err = s.Store.Initiated(persistCtx, a.Reference, a.AccessCode); err != nil {
			return nil, problem(503, "Payment initiation needs recovery. Check payment status; do not pay again.")
		}
	}
	return publicAttempt(a), nil
}
func (s *Service) Verify(ctx context.Context, reference, userID string) (map[string]any, error) {
	if !ValidReference(reference) {
		return nil, problem(400, "Invalid checkout reference.")
	}
	a, err := s.Store.FindAttempt(ctx, reference, userID)
	if err != nil {
		return nil, err
	}
	if a == nil {
		return nil, problem(404, "Checkout not found.")
	}
	if a.Mode == "live" && !s.Config.LiveReady() {
		return nil, problem(503, "Live checkout is not configured. No payment has been taken.")
	}
	if a.Mode == "live" {
		if store, ok := s.Store.(LiveStore); ok {
			order, e := store.FindLive(ctx, reference, userID)
			if e != nil {
				return nil, e
			}
			if order == nil {
				return nil, problem(404, "Checkout not found.")
			}
			a.Order = *order
		} else {
			policy := PolicyVersion
			a.Order.TermsVersion = &policy
		}
	}
	raw, err := s.Provider.Call(ctx, a.Mode, "/transaction/verify/"+reference, nil)
	if err != nil {
		return nil, err
	}
	t, err := ValidateTransaction(raw, a.Order)
	if err != nil {
		return nil, problem(409, err.Error())
	}
	state := "pending"
	if t.Status == "success" {
		state = "paid"
	} else if t.Status == "failed" || t.Status == "abandoned" || t.Status == "reversed" {
		state = t.Status
	}
	receipt := publicAttempt(*a)
	receipt["status"] = state
	receipt["membershipChanged"] = false
	var expiry *string
	if state == "paid" {
		if a.Mode == "test" {
			if err = s.Store.RecordTestPaid(ctx, a.Order, t); err != nil {
				return nil, err
			}
		} else {
			live, e := s.liveReceipt(ctx, a.Order, t)
			if e != nil {
				return nil, e
			}
			receipt = live
			if value, ok := receipt["expiresAt"].(string); ok && value != "" {
				expiry = &value
			}
		}
	}
	if a.Mode == "live" && state != "paid" {
		receipt, err = s.liveReceipt(ctx, a.Order, t)
		if err != nil {
			return nil, err
		}
	}
	if a.Method == "card" && a.AccessCode != nil && (state == "failed" || state == "abandoned") {
		state = "pending"
		receipt["status"] = state
	}
	if state == "paid" && a.AutoRenew && !a.EnrollmentProcessed && s.Config.RenewalReady() {
		// Enrollment is optional and independently reverified. Never undo a paid
		// receipt because an authorization token cannot be enrolled.
		enrollmentRaw, e := s.Provider.Call(ctx, a.Mode, "/transaction/verify/"+reference, nil)
		if e == nil {
			verified, e := ValidateTransaction(enrollmentRaw, a.Order)
			var token struct {
				Authorization struct {
					Code     string `json:"authorization_code"`
					Channel  string `json:"channel"`
					Reusable bool   `json:"reusable"`
				} `json:"authorization"`
			}
			if e == nil && verified.Status == "success" && json.Unmarshal(enrollmentRaw, &token) == nil && token.Authorization.Code != "" && token.Authorization.Channel == "card" && token.Authorization.Reusable {
				encrypted, e := EncryptAuthorization(token.Authorization.Code, s.Config.EncryptionKey)
				next := NextMonth(s.now())
				if expiry != nil {
					if parsed, e := time.Parse(time.RFC3339Nano, *expiry); e == nil {
						next = parsed
					}
				}
				if e == nil {
					if e = s.Store.Enroll(ctx, *a, encrypted, next); e != nil && s.Warn != nil {
						s.Warn("Verified payment retained; optional renewal enrollment needs reconciliation")
					}
				}
			}
		}
	}
	if err = s.Store.Reconcile(ctx, *a, state, expiry); err != nil {
		return nil, err
	}
	if userID == "" {
		delete(receipt, "accessCode")
	} else {
		receipt["accessCode"] = a.AccessCode
	}
	receipt["paymentMethod"] = a.Method
	return receipt, nil
}
