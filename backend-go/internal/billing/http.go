package billing

import (
	"context"
	"continua/backend/internal/auth"
	"encoding/json"
	"net/http"
	"strings"
)

type RenewalAccountStore interface {
	GetRenewal(context.Context, string, string) (json.RawMessage, error)
	DisableRenewal(context.Context, string, string) error
}

// AccountHTTP is called only after API-key and Supabase identity verification.
// Plan, email and ownership come from that verified identity, not request fields.
func (s *Service) AccountHTTP(ctx context.Context, w http.ResponseWriter, r *http.Request, id *auth.Identity) bool {
	path := r.URL.Path
	if !strings.HasPrefix(path, "/api/v1/billing/") {
		return false
	}
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	reply := func(data any, e error) {
		if e != nil {
			status := Status(e)
			message := "Internal server error"
			if status != 500 {
				message = e.Error()
			}
			w.WriteHeader(status)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"data": data})
	}
	if id == nil || id.UserID == "" {
		w.WriteHeader(401)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "Sign in to use Continua Engine"})
		return true
	}
	switch {
	case path == "/api/v1/billing/status" && r.Method == http.MethodGet:
		reply(map[string]any{"enabled": s.Config.LiveReady(), "nativeCheckout": s.Config.NativeForUser(id.UserID), "inlineCheckout": true, "nativeMode": s.Config.Mode, "mode": "live", "automaticRenewal": s.Config.RenewalReady()}, nil)
	case path == "/api/v1/billing/native-checkout" && r.Method == http.MethodPost:
		input, e := DecodeCheckout(r.Body)
		if e != nil {
			reply(nil, problem(400, "Check the payment method, phone number and billing agreement."))
			return true
		}
		data, e := s.Initialize(ctx, id.UserID, id.Email, input)
		reply(data, e)
	case strings.HasPrefix(path, "/api/v1/billing/native-verify/") && r.Method == http.MethodGet:
		ref := strings.TrimPrefix(path, "/api/v1/billing/native-verify/")
		data, e := s.Verify(ctx, ref, id.UserID)
		if Status(e) == 404 && strings.HasPrefix(ref, "continua-live-") {
			data, e = s.VerifyLive(ctx, ref, id.UserID)
		}
		reply(data, e)
	case path == "/api/v1/billing/checkout" && r.Method == http.MethodPost:
		input, e := DecodeAgreement(r.Body)
		if e != nil {
			reply(nil, problem(400, "Choose a valid plan and billing cycle, then acknowledge the current billing terms. Refresh checkout if needed."))
			return true
		}
		data, e := s.InitializeLive(ctx, id.UserID, id.Email, input)
		reply(data, e)
	case strings.HasPrefix(path, "/api/v1/billing/verify/") && r.Method == http.MethodGet:
		data, e := s.VerifyLive(ctx, strings.TrimPrefix(path, "/api/v1/billing/verify/"), id.UserID)
		reply(data, e)
	case path == "/api/v1/billing/renewal" && (r.Method == http.MethodGet || r.Method == http.MethodDelete):
		store, ok := s.Store.(RenewalAccountStore)
		if !ok {
			reply(nil, problem(501, "Renewal account operations have not yet been migrated."))
			return true
		}
		if r.Method == http.MethodGet {
			data, e := store.GetRenewal(ctx, id.UserID, s.Config.Mode)
			reply(data, e)
		} else {
			e := store.DisableRenewal(ctx, id.UserID, s.Config.Mode)
			reply(map[string]bool{"enabled": false}, e)
		}
	default:
		return false
	}
	return true
}
