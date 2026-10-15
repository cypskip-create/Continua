package billing

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func transactionFixture() map[string]any {
	return map[string]any{"id": 123, "domain": "test", "status": "success", "reference": "continua-test-fixture", "amount": 100000, "currency": "KES", "paid_at": "2026-10-13T08:00:00.000Z", "customer": map[string]any{"email": "fixture@example.test"}, "metadata": map[string]any{"continua_reference": "continua-test-fixture", "continua_user": "fixture-user", "mode": "test"}}
}
func TestTransactionRequiresTrustedAmountOwnerCurrencyAndMode(t *testing.T) {
	order := Order{Reference: "continua-test-fixture", Mode: "test", AmountMinor: 100000, UserID: "fixture-user", Email: "fixture@example.test"}
	raw, _ := json.Marshal(transactionFixture())
	if _, err := ValidateTransaction(raw, order); err != nil {
		t.Fatal(err)
	}
	for _, field := range []string{"amount", "domain", "currency", "paid_at", "customer", "metadata"} {
		fixture := transactionFixture()
		switch field {
		case "amount":
			fixture[field] = 1
		case "domain":
			fixture[field] = "live"
		case "currency":
			fixture[field] = "USD"
		case "paid_at":
			fixture[field] = nil
		case "customer":
			fixture[field] = map[string]any{"email": "other@example.test"}
		case "metadata":
			fixture[field] = map[string]any{"continua_reference": order.Reference, "continua_user": "forged", "mode": "test"}
		}
		raw, _ = json.Marshal(fixture)
		if _, err := ValidateTransaction(raw, order); err == nil {
			t.Fatal("untrusted receipt accepted", field)
		}
	}
}

func TestProviderIntegralDecimalNumbersKeepExactMinorUnits(t *testing.T) {
	order := Order{Reference: "continua-test-fixture", Mode: "test", AmountMinor: 100000, UserID: "fixture-user", Email: "fixture@example.test"}
	base, _ := json.Marshal(transactionFixture())
	for _, amount := range []string{"100000.0", "1e5", "100000.0000000000000000"} {
		raw := strings.Replace(string(base), `"amount":100000`, `"amount":`+amount, 1)
		raw = strings.Replace(raw, `"id":123`, `"id":123.0`, 1)
		value, err := ValidateTransaction([]byte(raw), order)
		if err != nil || value.Amount != 100000 || value.ID != 123 {
			t.Fatal(amount, value.Amount, err)
		}
	}
	for _, amount := range []string{`"100000"`, "true", "null", "100000.0000000000000001", "9223372036854775808", "1e100", "1e999999999", "1e-999999999"} {
		raw := strings.Replace(string(base), `"amount":100000`, `"amount":`+amount, 1)
		if _, err := ValidateTransaction([]byte(raw), order); err == nil {
			t.Fatal("non-integral or non-number receipt accepted", amount)
		}
	}
}
func TestMonthRenewalClampsCalendarDates(t *testing.T) {
	for date, want := range map[string]string{"2026-01-31T10:00:00Z": "2026-02-28T10:00:00Z", "2028-01-31T10:00:00Z": "2028-02-29T10:00:00Z", "2026-12-31T10:00:00Z": "2027-01-31T10:00:00Z"} {
		input, _ := time.Parse(time.RFC3339, date)
		if got := NextMonth(input).Format(time.RFC3339); got != want {
			t.Fatal(date, got, want)
		}
	}
}
func TestProviderTokenEncryptionAndTamperDetection(t *testing.T) {
	key := strings.Repeat("a", 64)
	encoded, err := EncryptAuthorization("AUTH_fixture_not_card_data", key)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(encoded, "AUTH_fixture") {
		t.Fatal("plaintext provider token stored")
	}
	got, err := DecryptAuthorization(encoded, key)
	if err != nil || got != "AUTH_fixture_not_card_data" {
		t.Fatal(err)
	}
	if _, err := DecryptAuthorization(encoded, strings.Repeat("b", 64)); err == nil {
		t.Fatal("tampered token accepted")
	}
	for _, value := range []string{"invalid", "abc.def.ghi"} {
		if _, err := DecryptAuthorization(value, key); err == nil {
			t.Fatal("invalid token accepted")
		}
	}
}
