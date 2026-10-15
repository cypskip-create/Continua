package billing

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/mail"
	"strconv"
	"strings"
	"time"
)

type Order struct {
	Reference, Mode, UserID, Email, Plan, Cycle string
	AmountMinor                                 int64
	TermsVersion                                *string
}
type Transaction struct {
	ID        int64   `json:"id"`
	Domain    string  `json:"domain"`
	Status    string  `json:"status"`
	Reference string  `json:"reference"`
	Amount    int64   `json:"amount"`
	Currency  string  `json:"currency"`
	PaidAt    *string `json:"paid_at"`
	Customer  struct {
		Email string `json:"email"`
	} `json:"customer"`
	Metadata struct {
		Reference string `json:"continua_reference"`
		UserID    string `json:"continua_user"`
		Mode      string `json:"mode"`
	} `json:"metadata"`
}

func providerInteger(raw json.RawMessage) (int64, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value any
	if decoder.Decode(&value) != nil {
		return 0, errors.New("invalid provider integer")
	}
	number, ok := value.(json.Number)
	if !ok {
		return 0, errors.New("invalid provider integer")
	}
	if len(number) > 128 {
		return 0, errors.New("invalid provider integer")
	}
	if index := strings.IndexAny(string(number), "eE"); index >= 0 {
		exponent, err := strconv.ParseInt(string(number)[index+1:], 10, 16)
		if err != nil || exponent > 32 || exponent < -32 {
			return 0, errors.New("invalid provider integer")
		}
	}
	decimal, ok := new(big.Rat).SetString(string(number))
	if !ok || !decimal.IsInt() || !decimal.Num().IsInt64() {
		return 0, errors.New("invalid provider integer")
	}
	return decimal.Num().Int64(), nil
}

// JSON numbers 100000, 100000.0 and 1e5 are the same integral minor-unit
// amount. Preserve that contract without accepting numeric strings, booleans,
// fractional values or a float-rounding approximation.
func (t *Transaction) UnmarshalJSON(raw []byte) error {
	type plain Transaction
	var decoded struct {
		ID     json.RawMessage `json:"id"`
		Amount json.RawMessage `json:"amount"`
		*plain
	}
	decoded.plain = (*plain)(t)
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return err
	}
	id, err := providerInteger(decoded.ID)
	if err != nil {
		return err
	}
	amount, err := providerInteger(decoded.Amount)
	if err != nil {
		return err
	}
	t.ID, t.Amount = id, amount
	return nil
}

func ValidateTransaction(raw []byte, order Order) (Transaction, error) {
	var transaction Transaction
	var fields map[string]json.RawMessage
	if json.Unmarshal(raw, &fields) != nil {
		return transaction, errors.New("Payment does not match this checkout.")
	}
	for _, name := range []string{"id", "domain", "status", "reference", "amount", "currency", "customer", "metadata"} {
		if value, ok := fields[name]; !ok || strings.TrimSpace(string(value)) == "null" {
			return transaction, errors.New("Payment does not match this checkout.")
		}
	}
	if order.Mode == "live" {
		if value, ok := fields["authorization"]; ok {
			var authorization struct {
				Code     *string `json:"authorization_code"`
				Channel  *string `json:"channel"`
				Reusable *bool   `json:"reusable"`
			}
			if json.Unmarshal(value, &authorization) != nil || authorization.Code == nil || authorization.Channel == nil || authorization.Reusable == nil {
				return transaction, errors.New("Payment does not match this checkout.")
			}
		}
	}
	if json.Unmarshal(raw, &transaction) != nil || transaction.ID <= 0 || transaction.ID > 9007199254740991 || transaction.Domain != order.Mode || transaction.Reference != order.Reference || transaction.Amount != order.AmountMinor || transaction.Currency != "KES" || transaction.Metadata.Reference != order.Reference || transaction.Metadata.UserID != order.UserID || transaction.Metadata.Mode != order.Mode || !strings.EqualFold(transaction.Customer.Email, order.Email) {
		return transaction, errors.New("Payment does not match this checkout.")
	}
	address, err := mail.ParseAddress(transaction.Customer.Email)
	if err != nil || address.Address != transaction.Customer.Email {
		return transaction, errors.New("Payment does not match this checkout.")
	}
	if transaction.PaidAt != nil {
		if _, err := time.Parse(time.RFC3339Nano, *transaction.PaidAt); err != nil {
			return transaction, errors.New("Invalid paid timestamp.")
		}
	}
	if transaction.Status == "success" {
		if transaction.PaidAt == nil {
			return transaction, errors.New("Successful payment lacks a paid timestamp.")
		}
		if _, err := time.Parse(time.RFC3339Nano, *transaction.PaidAt); err != nil {
			return transaction, errors.New("Invalid paid timestamp.")
		}
	}
	return transaction, nil
}
func NextMonth(value time.Time) time.Time {
	value = value.UTC()
	first := time.Date(value.Year(), value.Month()+1, 1, value.Hour(), value.Minute(), value.Second(), value.Nanosecond(), time.UTC)
	last := time.Date(first.Year(), first.Month()+1, 0, 0, 0, 0, 0, time.UTC).Day()
	day := value.Day()
	if day > last {
		day = last
	}
	return first.AddDate(0, 0, day-1)
}
func authorizationCipher(keyHex string) (cipher.AEAD, error) {
	key, err := hex.DecodeString(keyHex)
	if err != nil || len(key) != 32 {
		return nil, errors.New("Renewal encryption is not configured.")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}
func EncryptAuthorization(value, keyHex string) (string, error) {
	aead, err := authorizationCipher(keyHex)
	if err != nil {
		return "", err
	}
	iv := make([]byte, aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, iv); err != nil {
		return "", err
	}
	sealed := aead.Seal(nil, iv, []byte(value), nil)
	tag, ciphertext := sealed[len(sealed)-aead.Overhead():], sealed[:len(sealed)-aead.Overhead()]
	return fmt.Sprintf("%s.%s.%s", base64.StdEncoding.EncodeToString(iv), base64.StdEncoding.EncodeToString(tag), base64.StdEncoding.EncodeToString(ciphertext)), nil
}
func DecryptAuthorization(value, keyHex string) (string, error) {
	aead, err := authorizationCipher(keyHex)
	if err != nil {
		return "", err
	}
	parts := strings.Split(value, ".")
	if len(parts) != 3 {
		return "", errors.New("Invalid renewal token")
	}
	decoded := make([][]byte, 3)
	for i, p := range parts {
		decoded[i], err = base64.StdEncoding.DecodeString(p)
		if err != nil {
			return "", errors.New("Invalid renewal token")
		}
	}
	if len(decoded[0]) != aead.NonceSize() || len(decoded[1]) != aead.Overhead() {
		return "", errors.New("Invalid renewal token")
	}
	plaintext, err := aead.Open(nil, decoded[0], append(decoded[2], decoded[1]...), nil)
	if err != nil {
		return "", errors.New("Invalid renewal token")
	}
	return string(plaintext), nil
}
