# Native database TLS

Native Go and Python clients verify the database hostname and certificate chain.
Remote plaintext connections are rejected. No connection credentials are sent
to an unverified server.

Supabase shared poolers use a private Supabase CA rather than a public Web PKI
root. The public root is bundled with both clients, only for Supabase database
hostnames. Explicit caller-supplied root certificates remain authoritative.

Certificate source: the [official Supabase dashboard configuration](https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json),
whose production URL is
[Supabase Root 2021 CA](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt).
Downloaded over verified HTTPS on 2026-10-15.
DER SHA-256: `807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa`.
Expires 2031-04-26. Renewal requires reviewing the provider's authenticated
certificate distribution; never trust an arbitrary certificate from a failed
TLS handshake or disable verification as a recovery measure.

For other database providers, configure their verified root using PostgreSQL
`sslrootcert`/`PGSSLROOTCERT`. Loopback-only disposable PostgreSQL fixtures may
use plaintext and contain synthetic data only.
