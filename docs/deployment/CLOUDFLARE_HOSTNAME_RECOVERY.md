# Cloudflare hostname recovery

The existing Cloudflare service was renamed from continua-preview to continua through the hosting dashboard. The former workers.dev address returned a 404 HTML page while cached browser code still sent authentication there. The owned production origin is now https://continua.cypriankiprop41.workers.dev.

The main Wrangler name, browser cookie transport, media writer and operational probes must match that service. The existing Turnstile widget and Supabase callback allowlist must include the new owned hostname. Preserve the previous Turnstile domains during recovery.

A separate credential-free compatibility Worker at continua-preview redirects page and public media GET/HEAD requests to the pinned new origin. Old API requests return a JSON 410 explaining the move; they never redirect passwords, cookies or mutations across origins. Existing host-only login cookies are intentionally not copied between addresses; visitors sign in at the new address. The compatibility Worker has no database/storage bindings or secrets.

Deployment: use infra/cloudflare/wrangler.jsonc for the application and wrangler.legacy.jsonc only for the compatibility redirect. Do not deploy the main application configuration over the redirect by accident.
