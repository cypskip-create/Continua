import pg from "pg";

/** The repository contract uses ISO text, not node-postgres Date objects. */
export function isoTimestamp(value: unknown): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function registerDateTypes() {
  // DATE is a calendar day: do not shift it through the host's timezone.
  pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);
  pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, (value) =>
    isoTimestamp(value),
  );
}
