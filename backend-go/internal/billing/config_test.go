package billing

import "testing"

func TestConfigurationPreservesFlagsAndAllowlistWithoutProviderCalls(t *testing.T) {
	values := map[string]string{"PAYSTACK_NATIVE_ENABLED": "true", "PAYSTACK_TEST_SECRET_KEY": "sk_test_fixture", "PAYSTACK_TEST_USER_IDS": "11111111-1111-4111-8111-111111111111"}
	c, err := ConfigFromEnvironment(func(key string) string { return values[key] })
	if err != nil || c.Mode != "test" || !c.NativeForUser(values["PAYSTACK_TEST_USER_IDS"]) || c.NativeForUser("other") || c.LiveReady() {
		t.Fatal(c.Mode, err)
	}
	for key, value := range map[string]string{"PAYSTACK_NATIVE_MODE": "wrong", "PAYSTACK_NATIVE_ENABLED": "maybe", "PAYSTACK_TEST_USER_IDS": "not-a-user", "PAYSTACK_CARD_RENEWAL_ENABLED": "true"} {
		_, err := ConfigFromEnvironment(func(k string) string {
			if k == key {
				return value
			}
			return values[k]
		})
		if err == nil {
			t.Fatal(key)
		}
	}
}
