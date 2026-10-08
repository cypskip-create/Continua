import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("../src/config/index.js", () => ({ env: { NODE_ENV: "test", NEWS_SCRAPER_URL: "https://collector.example", NEWS_BRIDGE_CRON: "*/2 * * * *" } }));
vi.mock("../src/ingestion/pipelines/newsIngestionPipeline.js", () => ({ runNewsBridge: vi.fn().mockResolvedValue({ processed: 0, withMentions: 0, withoutMentions: 0, failed: 0 }) }));
vi.mock("../src/storage/repositories/newsRepository.js", () => ({ newsRepository: { revalidateBatch: vi.fn().mockResolvedValue({ processed: 0, lastId: "0" }) } }));
vi.mock("../src/monitoring/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-08T09:00:00Z")); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("starts collection without blocking the reader and coalesces concurrent reads", async () => {
  let finish!: (value: Response) => void;
  const fetchMock = vi.fn((_url: URL, _options: RequestInit) => new Promise<Response>(resolve => { finish = resolve; }));
  vi.stubGlobal("fetch", fetchMock);
  const { requestNewsCollection } = await import("../src/workers/newsWorker.js");
  expect(requestNewsCollection()).toBeUndefined();
  requestNewsCollection();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://collector.example/news/refresh");
  finish(new Response(null, { status: 202 }));
  await vi.advanceTimersByTimeAsync(0);
  requestNewsCollection();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(10 * 60_000);
  requestNewsCollection();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  finish(new Response(null, { status: 202 }));
  await vi.advanceTimersByTimeAsync(0);
});

it("contains collector failures and permits a later rate-limited retry", async () => {
  const fetchMock = vi.fn().mockRejectedValueOnce(new Error("collector asleep")).mockResolvedValue(new Response(null, { status: 202 }));
  vi.stubGlobal("fetch", fetchMock);
  const { requestNewsCollection } = await import("../src/workers/newsWorker.js");
  requestNewsCollection();
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(10 * 60_000);
  requestNewsCollection();
  await vi.advanceTimersByTimeAsync(0);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
