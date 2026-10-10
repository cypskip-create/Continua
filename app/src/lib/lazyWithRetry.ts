import { lazy, type ComponentType } from "react";
import { isChunkTransportError, recoverStaleChunk } from "./chunkRecovery.ts";

export async function retryModuleLoad<T>(
  load: () => Promise<T>,
  delayMs = 250,
): Promise<T> {
  try {
    return await load();
  } catch (error) {
    // Only fetch/chunk transport failures are retryable. Never rerun a module
    // which threw an application exception while evaluating.
    if (!isChunkTransportError(error))
      throw error;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return load();
  }
}
export function lazyWithRetry<T extends ComponentType<any>>(
  load: () => Promise<{ default: T }>,
) {
  return lazy(() => retryModuleLoad(load).catch((error) => {
    try {
      if (typeof window !== "undefined" && recoverStaleChunk(error, window.sessionStorage, () => window.location.reload())) {
        // Keep the loading state while the replacement document arrives.
        return new Promise<{ default: T }>(() => {});
      }
    } catch { /* Browser storage getters can themselves throw. */ }
    throw error;
  }));
}
