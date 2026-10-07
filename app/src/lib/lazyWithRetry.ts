import { lazy, type ComponentType } from "react";

export async function retryModuleLoad<T>(
  load: () => Promise<T>,
  delayMs = 250,
): Promise<T> {
  try {
    return await load();
  } catch (error) {
    // Only fetch/chunk transport failures are retryable. Never rerun a module
    // which threw an application exception while evaluating.
    if (
      !(error instanceof Error) ||
      !/Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk .* failed/i.test(
        error.message,
      )
    )
      throw error;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return load();
  }
}
export function lazyWithRetry<T extends ComponentType<any>>(
  load: () => Promise<{ default: T }>,
) {
  return lazy(() => retryModuleLoad(load));
}
