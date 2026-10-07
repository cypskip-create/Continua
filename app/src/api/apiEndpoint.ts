export const HOSTED_DATA_API = "https://continua-backend.onrender.com/api/v1";

export function resolveApiEndpoint(configured: string | undefined, production: boolean): { rest: string; upstream: string } {
  let upstream = configured?.trim() || (production ? HOSTED_DATA_API : "http://localhost:4000/api/v1");
  // A developer's checked-in local configuration must never ship as a loopback
  // request to a customer's phone. Keep intentional local endpoints in dev.
  if (production && /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(upstream)) upstream = HOSTED_DATA_API;
  upstream = upstream.replace(/\/$/, "");
  // Render's security edge can challenge Vercel's shared server-to-server
  // egress. Use the browser's direct, CORS-authorized connection instead.
  return { rest: upstream, upstream };
}
