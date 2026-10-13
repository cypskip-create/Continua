package billing

import (
	"context"
	"encoding/json"
	"sync/atomic"
	"time"
)

type RenewalCandidate struct{ UserID, Mode string }
type RenewalReservation struct {
	Reference, UserID, Email, Mode, AuthorizationCipher string
	AmountMinor                                         int64
	Initiate                                            bool
}
type RenewalStore interface {
	DueRenewals(context.Context, string) ([]RenewalCandidate, error)
	ReserveRenewal(context.Context, RenewalCandidate) (*RenewalReservation, error)
	Initiated(context.Context, string, *string) error
	Unknown(context.Context, string) error
}
type RenewalWorker struct {
	Service *Service
	Store   RenewalStore
	running atomic.Bool
	// Only a generic warning is emitted; provider responses and tokens stay private.
	Warn func(string)
}

func (w *RenewalWorker) warn() {
	if w.Warn != nil {
		w.Warn("Card renewal needs verification; no automatic charge retry")
	}
}
func (w *RenewalWorker) Run(ctx context.Context) error {
	if !w.Service.Config.RenewalReady() || !w.running.CompareAndSwap(false, true) {
		return nil
	}
	defer w.running.Store(false)
	candidates, err := w.Store.DueRenewals(ctx, w.Service.Config.Mode)
	if err != nil {
		return err
	}
	for _, candidate := range candidates {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		// A whole candidate (database plus provider plus verification) is bounded.
		attemptCtx, cancel := context.WithTimeout(ctx, 40*time.Second)
		reserved, e := w.Store.ReserveRenewal(attemptCtx, candidate)
		if e != nil {
			w.warn()
			cancel()
			continue
		}
		if reserved == nil {
			cancel()
			continue
		}
		if reserved.Initiate {
			token, e := DecryptAuthorization(reserved.AuthorizationCipher, w.Service.Config.EncryptionKey)
			if e == nil {
				metadata, _ := json.Marshal(map[string]string{"continua_reference": reserved.Reference, "continua_user": reserved.UserID, "mode": reserved.Mode})
				_, e = w.Service.Provider.Call(attemptCtx, reserved.Mode, "/transaction/charge_authorization", map[string]any{"email": reserved.Email, "amount": reserved.AmountMinor, "currency": "KES", "reference": reserved.Reference, "authorization_code": token, "metadata": string(metadata)})
			}
			persistCtx, stop := context.WithTimeout(context.WithoutCancel(attemptCtx), 5*time.Second)
			if e != nil {
				e = w.Store.Unknown(persistCtx, reserved.Reference)
			} else {
				e = w.Store.Initiated(persistCtx, reserved.Reference, nil)
			}
			stop()
			if e != nil {
				w.warn()
				cancel()
				continue
			}
		}
		// Previously reserved references are verified only, including unknown outcomes.
		if _, e = w.Service.Verify(attemptCtx, reserved.Reference, ""); e != nil {
			w.warn()
		}
		cancel()
	}
	return nil
}

// Start aligns with the existing */10 cron rather than auto-charging at startup.
// It must not be launched until native billing and all cutover gates pass.
func (w *RenewalWorker) Start(ctx context.Context) {
	for {
		now := time.Now().UTC()
		next := now.Truncate(10 * time.Minute).Add(10 * time.Minute)
		timer := time.NewTimer(time.Until(next))
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
			if err := w.Run(ctx); err != nil {
				w.warn()
			}
		}
	}
}
