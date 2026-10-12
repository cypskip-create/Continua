type StorageView = Pick<Storage, "length" | "key" | "removeItem">;
/** Called only after server-confirmed account deletion. Never clear unrelated
 * accounts or public research caches on a shared device. */
export function clearDeletedAccountStorage(
  account: string,
  storage: StorageView,
) {
  const keys: string[] = [];
  let complete = true;
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (
        key &&
        (key.startsWith(`continua:journal:v1:${account}:`) ||
          key === `continua_app_lock_${account}` ||
          key === `continua_app_lock_cred_${account}`)
      )
        keys.push(key);
    }
  } catch {
    complete = false;
  }
  let removed = 0;
  for (const key of keys) {
    try {
      storage.removeItem(key);
      removed++;
    } catch {
      complete = false;
    }
  }
  return { removed, complete };
}
