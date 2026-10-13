package billing

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"
)

// Webhook validates exact raw bytes before JSON parsing. Verified provider
// receipts, never event-supplied amounts or user IDs, drive fulfillment.
// It remains unmounted until the native billing route integration is validated.
func (s *Service) Webhook(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	writeError := func(status int, message string) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
	}
	if r.Method != http.MethodPost {
		writeError(405, "Method not allowed")
		return
	}
	raw, err := io.ReadAll(io.LimitReader(r.Body, 65537))
	if err != nil || len(raw) > 65536 {
		writeError(413, "Payment event is too large.")
		return
	}
	signature := r.Header.Get("x-paystack-signature")
	mode := ""
	if s.Config.LiveReady() && ValidWebhookSignature(raw, signature, s.Config.LiveKey) {
		mode = "live"
	} else if strings.HasPrefix(s.Config.TestKey, "sk_test_") && ValidWebhookSignature(raw, signature, s.Config.TestKey) {
		mode = "test"
	}
	if mode == "" {
		writeError(401, "Invalid payment signature.")
		return
	}
	var event any
	if json.Unmarshal(raw, &event) != nil {
		writeError(400, "Invalid payment event.")
		return
	}
	object, _ := event.(map[string]any)
	name, _ := object["event"].(string)
	data, _ := object["data"].(map[string]any)
	reference, _ := data["reference"].(string)
	if name == "charge.success" && ValidReference(reference) {
		if !strings.HasPrefix(reference, "continua-"+mode+"-") {
			writeError(401, "Payment signature mode mismatch.")
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
		defer cancel()
		_, err = s.Verify(ctx, reference, "")
		if err != nil {
			if Status(err) == 404 && mode == "live" {
				_, err = s.VerifyLive(ctx, reference, "")
				if err != nil {
					status := Status(err)
					message := "Payment verification needs another attempt."
					if status < 500 {
						message = err.Error()
					}
					writeError(status, message)
					return
				}
			}
			if err == nil {
				w.WriteHeader(200)
				return
			}
			if Status(err) != 404 {
				status := Status(err)
				message := "Payment verification needs another attempt."
				if status < 500 {
					message = err.Error()
				}
				writeError(status, message)
				return
			}
		}
	}
	w.WriteHeader(200)
}
