package billing

import (
	"crypto/hmac"
	"crypto/sha512"
	"encoding/hex"
	"strings"
	"testing"
)

func TestPrices(t *testing.T) {
	for key, want := range map[string]int64{"premium:monthly": 80000, "premium:annual": 798000, "premium_plus:monthly": 100000, "premium_plus:annual": 996000} {
		parts := strings.Split(key, ":")
		got, err := PriceMinor(parts[0], parts[1])
		if err != nil || got != want {
			t.Fatal(key, got, err)
		}
	}
	if _, err := PriceMinor("admin", "monthly"); err == nil {
		t.Fatal("untrusted plan accepted")
	}
}
func TestPhones(t *testing.T) {
	for _, s := range []string{"0712 345 678", "+254712345678", "254712345678", "(0712)-345678", "0112345678"} {
		if _, err := NormalizeKenyanPhone(s); err != nil {
			t.Fatal(s, err)
		}
	}
	for _, s := range []string{"+15551234567", "254812345678", "07123456789", "+254+712345678"} {
		if _, err := NormalizeKenyanPhone(s); err == nil {
			t.Fatal("invalid phone accepted", s)
		}
	}
}
func TestWebhookUsesExactBytes(t *testing.T) {
	body := []byte(`{"event":"charge.success"}`)
	mac := hmac.New(sha512.New, []byte("fixture-not-real"))
	mac.Write(body)
	signature := hex.EncodeToString(mac.Sum(nil))
	if !ValidWebhookSignature(body, signature, "fixture-not-real") {
		t.Fatal("valid signature rejected")
	}
	if ValidWebhookSignature(append(body, ' '), signature, "fixture-not-real") || ValidWebhookSignature(body, "bad", "fixture-not-real") || ValidWebhookSignature(body, signature, "") {
		t.Fatal("invalid signature accepted")
	}
}
func TestCheckoutRejectsOrdinaryCardFieldsAndUntrustedAmounts(t *testing.T) {
	base := `{"plan":"premium_plus","cycle":"monthly","policyVersion":"2026-10-12","accepted":true,"paymentMethod":"card","intentId":"12345678-1234-4123-8123-123456789012"`
	for _, extra := range []string{`,"amount":1}`, `,"cardNumber":"4111111111111111"}`, `,"cvv":"123"}`, `,"phone":"0712345678"}`} {
		if _, err := DecodeCheckout(strings.NewReader(base + extra)); err == nil {
			t.Fatal("unsafe checkout field accepted")
		}
	}
	if _, err := DecodeCheckout(strings.NewReader(base + `}`)); err != nil {
		t.Fatal(err)
	}
	if _, err := DecodeCheckout(strings.NewReader(base + `} {}`)); err == nil {
		t.Fatal("extra JSON accepted")
	}
}
