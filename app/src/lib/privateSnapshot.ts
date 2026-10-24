const prefix = 'continua:private-snapshot:';
const maxAge = 24 * 60 * 60_000;
// Display snapshots only: never credentials, subscription grants or API results
// that bypass authorization. Callers wait for the verified current user first.
export function readPrivateSnapshot<T>(kind: 'watchlist', owner: string, storage: Pick<Storage, "getItem" | "setItem"> | undefined = undefined, now = Date.now()): T | undefined {
  try {
    const entry = JSON.parse((storage ?? localStorage).getItem(`${prefix}${kind}:${owner}`) ?? 'null');
    if (entry?.owner !== owner || !Number.isFinite(entry.savedAt) || entry.savedAt > now || now - entry.savedAt >= maxAge || !Array.isArray(entry.data) || entry.data.some((row: {user_id?: string}) => row?.user_id !== owner)) return undefined;
    return entry.data as T;
  } catch { return undefined; }
}
export function writePrivateSnapshot(kind: 'watchlist', owner: string, data: unknown, storage: Pick<Storage, "getItem" | "setItem"> | undefined = undefined, now = Date.now()) {
  if (!Array.isArray(data) || data.some(row => row?.user_id !== owner)) return;
  try { (storage ?? localStorage).setItem(`${prefix}${kind}:${owner}`, JSON.stringify({owner, savedAt: now, data})); } catch { /* Storage is optional. */ }
}
