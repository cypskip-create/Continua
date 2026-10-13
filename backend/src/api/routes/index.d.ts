/** Every route is mounted under /api/v1. Versioning from day one — the app,
 *  TradersHub, and Media all consume this same v1 contract; a v2 later can
 *  be added alongside it without breaking existing clients.
 *
 *  NOTE: health.routes.ts is intentionally NOT included here — it's mounted
 *  separately in server.ts, ahead of the auth/rate-limit middleware, so
 *  infra probes (load balancer health checks, uptime monitors) never need
 *  an API key and never count against anyone's rate limit. */
export declare const apiRouter: import("express-serve-static-core").Router;
