// Package billing preserves server-owned billing contracts. Provider execution
// and fulfillment are separate ports; these helpers do not initiate charges.
package billing

import (
	"crypto/hmac"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"regexp"
	"strings"
)

const PolicyVersion = "2026-10-12"

var phonePattern = regexp.MustCompile(`^254[17][0-9]{8}$`)
var intentPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$`)
var referencePattern = regexp.MustCompile(`^continua-(live|test)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

type CheckoutInput struct {
	Plan          string  `json:"plan"`
	Cycle         string  `json:"cycle"`
	PolicyVersion string  `json:"policyVersion"`
	Accepted      bool    `json:"accepted"`
	PaymentMethod string  `json:"paymentMethod"`
	Phone         *string `json:"phone,omitempty"`
	IntentID      string  `json:"intentId"`
	AutoRenew     bool    `json:"autoRenew"`
}

func PriceMinor(plan, cycle string) (int64, error) {
	switch plan + ":" + cycle {
	case "premium:monthly":
		return 80000, nil
	case "premium:annual":
		return 798000, nil
	case "premium_plus:monthly":
		return 100000, nil
	case "premium_plus:annual":
		return 996000, nil
	default:
		return 0, errors.New("invalid plan or cycle")
	}
}
func NormalizeKenyanPhone(value string) (string, error) {
	compact := strings.Map(func(r rune) rune {
		if r == ' ' || r == '\t' || r == '\n' || r == '\r' || r == '(' || r == ')' || r == '-' {
			return -1
		}
		return r
	}, strings.TrimSpace(value))
	digits := strings.TrimPrefix(compact, "+")
	if strings.HasPrefix(digits, "01") || strings.HasPrefix(digits, "07") {
		digits = "254" + digits[1:]
	}
	if !phonePattern.MatchString(digits) {
		return "", errors.New("Enter a valid Kenyan mobile number, such as 0712 345 678.")
	}
	return "+" + digits, nil
}
func DecodeCheckout(reader io.Reader) (CheckoutInput, error) {
	var input CheckoutInput
	raw, err := io.ReadAll(io.LimitReader(reader, 65537))
	if err != nil || len(raw) > 65536 {
		return input, errors.New("invalid checkout request")
	}
	var fields map[string]json.RawMessage
	if json.Unmarshal(raw, &fields) != nil {
		return input, errors.New("invalid checkout request")
	}
	for _, field := range []string{"phone", "autoRenew"} {
		if value, exists := fields[field]; exists && strings.TrimSpace(string(value)) == "null" {
			return input, errors.New("invalid checkout request")
		}
	}
	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		return input, errors.New("invalid checkout request")
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return input, errors.New("invalid checkout request")
	}
	if _, err := PriceMinor(input.Plan, input.Cycle); err != nil {
		return input, err
	}
	if !input.Accepted || input.PolicyVersion != PolicyVersion || !intentPattern.MatchString(input.IntentID) {
		return input, errors.New("checkout acknowledgement and valid intent are required")
	}
	if input.PaymentMethod != "mpesa" && input.PaymentMethod != "airtel" && input.PaymentMethod != "card" {
		return input, errors.New("unsupported payment method")
	}
	if input.AutoRenew && (input.PaymentMethod != "card" || input.Cycle != "monthly") {
		return input, errors.New("Automatic renewal is available only for monthly card payments.")
	}
	if input.PaymentMethod == "card" {
		if input.Phone != nil {
			return input, errors.New("Card checkout must not include phone or card details.")
		}
	} else {
		if input.Phone == nil || len(*input.Phone) > 40 {
			return input, errors.New("A valid Kenyan mobile number is required.")
		}
		normalized, err := NormalizeKenyanPhone(*input.Phone)
		if err != nil {
			return input, err
		}
		input.Phone = &normalized
	}
	return input, nil
}
func ValidReference(value string) bool { return referencePattern.MatchString(value) }
func ValidWebhookSignature(body []byte, signature, key string) bool {
	if len(signature) != 128 || key == "" {
		return false
	}
	provided, err := hex.DecodeString(signature)
	if err != nil {
		return false
	}
	digest := hmac.New(sha512.New, []byte(key))
	digest.Write(body)
	return hmac.Equal(digest.Sum(nil), provided)
}
