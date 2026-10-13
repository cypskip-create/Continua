package auth

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
)

type Identity struct{ UserID, Email, Plan string }
type UserStore interface {
	EffectivePlan(context.Context, string) (string, error)
}
type AccessError struct {
	Status  int
	Message string
}

func (e *AccessError) Error() string { return e.Message }

type UserVerifier struct {
	BaseURL string
	Client  *http.Client
	Store   UserStore
}

var userPattern = regexp.MustCompile(`^[0-9a-fA-F-]{36}$`)

func NewUserVerifier(base string, store UserStore) *UserVerifier {
	return &UserVerifier{BaseURL: strings.TrimRight(base, "/"), Store: store, Client: &http.Client{Timeout: 10 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
}
func (v *UserVerifier) Verify(ctx context.Context, headers http.Header) (*Identity, error) {
	token, key := headers.Get("X-User-Token"), headers.Get("X-Supabase-Key")
	if token == "" || key == "" || len(token) > 16384 || len(key) > 8192 {
		return nil, &AccessError{401, "Sign in to use Continua Engine"}
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, v.BaseURL+"/auth/v1/user", nil)
	if err != nil {
		return nil, &AccessError{503, "Unable to verify Engine access. Please retry."}
	}
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("apikey", key)
	response, err := v.Client.Do(request)
	if err != nil {
		return nil, &AccessError{503, "Unable to verify Engine access. Please retry."}
	}
	defer response.Body.Close()
	if response.StatusCode == 401 || response.StatusCode == 403 {
		return nil, &AccessError{401, "Your session expired. Sign in again."}
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, &AccessError{503, "Unable to verify Engine access. Please retry."}
	}
	raw, err := io.ReadAll(io.LimitReader(response.Body, 65537))
	if err != nil || len(raw) > 65536 {
		return nil, &AccessError{503, "Unable to verify Engine access. Please retry."}
	}
	var user struct {
		ID    string `json:"id"`
		Email string `json:"email"`
	}
	if json.Unmarshal(raw, &user) != nil || !userPattern.MatchString(user.ID) {
		return nil, &AccessError{401, "Invalid user session"}
	}
	plan, err := v.Store.EffectivePlan(ctx, user.ID)
	if err != nil {
		return nil, &AccessError{503, "Unable to verify Engine access. Please retry."}
	}
	if plan == "" {
		plan = "free"
	}
	return &Identity{UserID: user.ID, Email: user.Email, Plan: plan}, nil
}
func RequirePremium(identity *Identity) error {
	if identity == nil {
		return &AccessError{401, "Sign in to use Continua Engine"}
	}
	if identity.Plan != "premium" && identity.Plan != "premium_plus" {
		return &AccessError{403, "Continua Engine is included with Premium. Upgrade to unlock it."}
	}
	return nil
}
func RequirePlus(identity *Identity) error {
	if identity == nil {
		return &AccessError{401, "Sign in to use Continua Engine"}
	}
	if identity.Plan != "premium_plus" {
		return &AccessError{403, "Upgrade to Premium Plus to use the full Continua Engine."}
	}
	return nil
}
func AccessStatus(err error) int {
	var access *AccessError
	if errors.As(err, &access) {
		return access.Status
	}
	return 503
}
