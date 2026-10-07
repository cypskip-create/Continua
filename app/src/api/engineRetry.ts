import { ContinuaApiError } from "./client";
/** One retry for transient server failures; never repeat auth, quota or writes. */
export const engineReadRetry = (count: number, error: Error) =>
  count < 1 &&
  error instanceof ContinuaApiError &&
  [500, 502, 503, 504].includes(error.status);
