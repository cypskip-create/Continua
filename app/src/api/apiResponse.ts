export class DataApiResponseError extends Error {
  readonly status: number;
  readonly responseStatus: number;
  constructor(message: string, status: number, responseStatus: number) {
    super(message);
    this.name = "DataApiResponseError";
    this.status = status;
    this.responseStatus = responseStatus;
  }
}

/** Never confuse an HTML/protocol response with a connection that failed.
 * Response text is deliberately not exposed: it can contain private data. */
export async function readApiData<T>(response: Response): Promise<T> {
  const type = response.headers.get("content-type") ?? "";
  if (response.headers.get("cf-mitigated") === "challenge" || (response.status === 429 && type.includes("text/html"))) {
    throw new DataApiResponseError("The hosting security check blocked the API request. Please retry shortly.", response.status, response.status);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (!response.ok) throw new DataApiResponseError(`Continua Data API request failed (${response.status})`, response.status, response.status);
    // A failed body download is still a transport error, not malformed JSON.
    if (!(error instanceof SyntaxError)) throw error;
    throw new DataApiResponseError(`Continua Data API returned an unreadable response (HTTP ${response.status}). Retry shortly.`, 502, response.status);
  }
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error : `Continua Data API request failed (${response.status})`;
    throw new DataApiResponseError(message, response.status, response.status);
  }
  if (!body || typeof body !== "object" || !("data" in body)) {
    throw new DataApiResponseError(`Continua Data API returned an unexpected response (HTTP ${response.status}). Retry shortly.`, 502, response.status);
  }
  return body.data as T;
}
