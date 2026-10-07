function pause(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const abort = () => { clearTimeout(timer); reject(signal?.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
    signal?.addEventListener("abort", abort, {once:true});
  });
}

/** One bounded retry for an explicit application throttle, never a security
 * challenge or a mutation whose success could be uncertain. */
export async function fetchWithRateLimitRecovery(url: string, init: RequestInit, request: typeof fetch = fetch, wait = pause): Promise<Response> {
  const response = await request(url, init);
  if ((init.method ?? "GET") !== "GET" || response.status !== 429 || response.headers.get("cf-mitigated") === "challenge" || !response.headers.get("content-type")?.includes("application/json")) return response;
  const retry = response.headers.get("retry-after");
  if (retry == null) return response;
  const seconds = /^\d+(?:\.\d+)?$/.test(retry) ? Number(retry) : (Date.parse(retry) - Date.now()) / 1000;
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 10) return response;
  await response.body?.cancel();
  await wait(seconds * 1000, init.signal);
  return request(url, init);
}
