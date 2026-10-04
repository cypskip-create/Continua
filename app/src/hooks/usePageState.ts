import { useState, type Dispatch, type SetStateAction } from "react";
import { useAuth } from "./useAuth";

const state = new Map<string, unknown>();
/** In-memory, account-scoped tab/filter state. Does not persist drafts or secrets. */
export function usePageState<T>(name: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const { user } = useAuth();
  const key = `${user?.id ?? 'anonymous'}:${name}`;
  const read = () => state.has(key) ? state.get(key) as T : initial;
  const [entry, setEntry] = useState(() => ({ key, value: read() }));
  const value = entry.key === key ? entry.value : read();
  if (entry.key !== key) setEntry({ key, value });
  const setValue = (updater: (previous: T) => T) => setEntry(previous => ({ key, value: updater(previous.key === key ? previous.value : read()) }));
  const update: Dispatch<SetStateAction<T>> = (next) => setValue((previous) => {
    const resolved = typeof next === 'function' ? (next as (value: T) => T)(previous) : next;
    state.set(key, resolved);
    return resolved;
  });
  return [value, update];
}
