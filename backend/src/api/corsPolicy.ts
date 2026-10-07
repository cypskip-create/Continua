/** Exact project aliases, never arbitrary Vercel sites or wildcard origins. */
const projectOrigins = new Set([
  "https://continua-delta.vercel.app",
  "https://continua-cypskip-creates-projects.vercel.app",
  "http://localhost:8080", "http://127.0.0.1:8080",
  "http://localhost:5173", "http://127.0.0.1:5173",
  "http://localhost:5191", "http://127.0.0.1:5191",
]);
const projectPreview = /^https:\/\/continua(-[a-z0-9-]+)?-cypskip-creates-projects\.vercel\.app$/;
export function isAllowedBrowserOrigin(origin: string | undefined, configured: readonly string[]): boolean {
  return !origin || projectOrigins.has(origin) || configured.includes(origin) || projectPreview.test(origin);
}
