/**
 * Single source of truth for user handles across TradersHub.
 * Every surface (feed, profile, search, notifications, mentions) must render
 * the handle through these helpers so identity never drifts.
 */

export interface HandleSource {
  handle?: string | null;
  full_name?: string | null;
  user_id?: string | null;
  id?: string | null;
}

/** Normalise a handle candidate: strip @, lowercase, allow a-z0-9_ only. */
export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 15);
}

/** Deterministic fallback handle derived from the display name / id. */
export function fallbackHandle(source?: HandleSource | null): string {
  const name = source?.full_name ? normalizeHandle(source.full_name) : "";
  if (name) return name;
  const id = source?.user_id || source?.id || "";
  return id ? `afri${id.replace(/-/g, "").slice(0, 6)}` : "afriuser";
}

/** Handle without the leading @. */
export function getHandle(source?: HandleSource | null): string {
  const set = source?.handle ? normalizeHandle(source.handle) : "";
  return set || fallbackHandle(source);
}

/** Handle with the leading @, ready to render. */
export function atHandle(source?: HandleSource | null): string {
  return `@${getHandle(source)}`;
}

/** Initials for avatar fallbacks. */
export function getInitials(name?: string | null): string {
  if (!name) return "AF";
  return name.split(" ").filter(Boolean).map(n => n[0]).join("").toUpperCase().slice(0, 2) || "AF";
}
