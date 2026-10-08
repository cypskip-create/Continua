import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ list: vi.fn(), run: vi.fn() }));
vi.mock("../src/config/index.js", () => ({ env: { SCHEDULER_ENABLED: true, NEWS_CRAWL_CRON: "*/10 * * * *" } }));
vi.mock("../src/storage/sourcesRepository.js", () => ({ listEnabledSources: mocks.list }));
vi.mock("../src/adapters/registry.js", () => ({ hasRegisteredAdapter: () => true, runRegisteredAdapter: mocks.run }));
vi.mock("../src/crawler/crawlSource.js", () => ({ crawlSource: vi.fn() }));
vi.mock("../src/extraction/extractionSweep.js", () => ({ sweepUnextractedArtifacts: vi.fn() }));
vi.mock("../src/config/defaultSources.js", () => ({ ensureDefaultSources: vi.fn() }));
vi.mock("../src/monitoring/logger.js", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

it("shares reader-triggered crawls, limits concurrency and excludes non-news sources", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-08T09:00:00Z"));
  mocks.list.mockResolvedValue([{ id: "a", adapter: "rss" }, { id: "b", adapter: "rss" }, { id: "c", adapter: "rss" }, { id: "pdf", adapter: "nse" }]);
  let active = 0, peak = 0;
  mocks.run.mockImplementation(async () => {
    peak = Math.max(peak, ++active);
    await new Promise(resolve => setTimeout(resolve, 100));
    active--;
    return { discovered: 1, extracted: 1, failed: 0 };
  });
  const { refreshNewsSources } = await import("../src/scheduler/scheduler.js");
  const first = refreshNewsSources();
  expect(refreshNewsSources()).toBe(first);
  await vi.advanceTimersByTimeAsync(200);
  await first;
  expect(peak).toBe(2);
  expect(mocks.run.mock.calls.map(([source]) => source.id).sort()).toEqual(["a", "b", "c"]);
  await refreshNewsSources();
  expect(mocks.list).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(10 * 60_000);
  const later = refreshNewsSources();
  await vi.advanceTimersByTimeAsync(200);
  await later;
  expect(mocks.list).toHaveBeenCalledTimes(2);
});
