/**
 * Runs before any test file's imports. Ensures test runs are deterministic
 * regardless of a developer's local .env — without this, a `.env` set up
 * for manual/Docker testing (e.g. IGNORE_TRADING_CALENDAR=true, used to
 * make the mock feed "trade" outside market hours during a demo) would
 * silently change trading-calendar test behavior depending on who's
 * running the suite and what they last had in their .env.
 */
process.env.IGNORE_TRADING_CALENDAR = "false";
// Unit tests import validated runtime config. Give them a syntactically
// valid, deliberately unused URL without accidentally opting into the
// destructive integration suite below.
process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/continua_test";
