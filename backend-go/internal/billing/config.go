package billing

import (
	"errors"
	"regexp"
	"strings"
)

var userIDPattern = regexp.MustCompile(`^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$`)

// Configuration parsing is pure; it never contacts a provider or starts a job.
func ConfigFromEnvironment(get func(string) string) (Config, error) {
	c := Config{Mode: get("PAYSTACK_NATIVE_MODE"), LiveKey: get("PAYSTACK_SECRET_KEY"), TestKey: get("PAYSTACK_TEST_SECRET_KEY"), CallbackURL: get("PAYSTACK_CALLBACK_URL"), EncryptionKey: get("PAYSTACK_RENEWAL_ENCRYPTION_KEY"), TestUsers: map[string]bool{}}
	if c.Mode == "" {
		c.Mode = "test"
	}
	if c.Mode != "test" && c.Mode != "live" {
		return c, errors.New("invalid billing mode")
	}
	for key, target := range map[string]*bool{"PAYSTACK_NATIVE_ENABLED": &c.NativeEnabled, "PAYSTACK_LIVE_CHECKOUT_ENABLED": &c.LiveEnabled, "PAYSTACK_CARD_RENEWAL_ENABLED": &c.RenewalEnabled} {
		value := strings.ToLower(strings.TrimSpace(get(key)))
		switch value {
		case "", "false", "0":
			*target = false
		case "true", "1":
			*target = true
		default:
			return c, errors.New("invalid billing flag")
		}
	}
	users := get("PAYSTACK_TEST_USER_IDS")
	if len(users) > 4000 {
		return c, errors.New("billing test user limit")
	}
	for _, id := range strings.Split(users, ",") {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		if !userIDPattern.MatchString(id) {
			return c, errors.New("invalid billing test user")
		}
		c.TestUsers[id] = true
	}
	if c.RenewalEnabled && !c.RenewalReady() {
		return c, errors.New("renewal configuration incomplete")
	}
	return c, nil
}
