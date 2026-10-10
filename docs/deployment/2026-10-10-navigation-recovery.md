# Checkout exit and login navigation repair

The Upgrade and Settings back buttons used `/profile` as their direct-entry
fallback. The account route is `/account`; `/profile/:userId` is a different,
public user-profile screen. Reproduced the production 404 at `/profile`.

- Both fallbacks now use `/account`.
- Leaving a payment callback with a reference replaces the return screen with
  `/account`, rather than revisiting the provider through browser history.
- Existing `/profile` links redirect to `/account`, preserving query and hash.
- Removed the competing `/*` layout index: router matching selected it over
  the session-aware `/` entry. The private layout is now pathless, so signed-out
  Home opens the website and signed-in Home opens the app as intended.
- Unknown routes still render 404; this does not hide genuine missing pages.

The account smoke check also found a privacy toggle reporting success even when
its database save failed. It now waits for a successful save, reports failure
without changing displayed visibility, and blocks duplicate toggles while saving.
Removed the stale "unlimited AI" membership claim from the same screen.

Production smoke testing reproduced a retired deployment chunk when moving to
Portfolio from a tab opened before the next release. Reload restored Portfolio.
Page imports now retry once and, only for chunk transport errors, refresh the
document once with a session-storage guard (three-minute cooldown). Disabled
storage and application exceptions retain the normal recovery screen; the
guard prevents persistent offline failures from reloading in a loop.

Verification: 65 frontend tests passed, frontend build and TypeScript checks
passed; 215 backend tests passed, six database integration tests skipped.
The first sandboxed backend run could not create temporary test files; rerunning
outside the sandbox passed. Production ledger read confirmed a recent paid
Premium monthly order has a receipt and membership expiry. No new charge made.

No database migration or payment-provider configuration change is required.
This is a navigation fix, not a claim that every app interaction is bug-free.
