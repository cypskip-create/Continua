const recoveryKey = 'continua-chunk-recovery';

export function isChunkTransportError(error: unknown): error is Error {
  return error instanceof Error && /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk .* failed/i.test(error.message);
}

/** A deployment may retire assets referenced by an already-open tab. Refresh
 * its entry document once; offline or persistent failures must never loop. */
export function recoverStaleChunk(
  error: unknown,
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  reload: () => void,
  now = Date.now(),
) {
  if (!isChunkTransportError(error)) return false;
  try {
    const previous = Number(storage.getItem(recoveryKey));
    if (previous > 0 && now - previous < 180_000) return false;
    storage.setItem(recoveryKey, String(now));
    reload();
    return true;
  } catch {
    // Storage may be disabled. Without a persisted guard, never auto-reload.
    return false;
  }
}
