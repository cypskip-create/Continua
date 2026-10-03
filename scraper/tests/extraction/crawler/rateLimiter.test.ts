import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/continua_test";
process.env.LOG_LEVEL ??= "fatal";

const { throttleHost } = await import("../../../src/crawler/rateLimiter.js");

describe("throttleHost", () => {
  it("enforces the minimum interval between requests to the same host", async () => {
    const host = `test-host-${Date.now()}.example`; // unique per test run to avoid cross-test interference
    const start = Date.now();
    await throttleHost(host, 2); // 2 req/sec = 500ms minimum interval
    await throttleHost(host, 2);
    await throttleHost(host, 2);
    const elapsed = Date.now() - start;
    // 3 requests at 2/sec should take roughly 1000ms (2 intervals of 500ms after the first free request)
    expect(elapsed).toBeGreaterThanOrEqual(900);
    expect(elapsed).toBeLessThan(1300);
  });

  it("does not throttle different hosts against each other", async () => {
    const start = Date.now();
    await throttleHost(`host-a-${Date.now()}.example`, 1);
    await throttleHost(`host-b-${Date.now()}.example`, 1);
    // Different hosts, first request each — should both be immediate.
    expect(Date.now() - start).toBeLessThan(100);
  });

  it("does not throttle at all when requestsPerSecond is 0", async () => {
    const host = `unthrottled-${Date.now()}.example`;
    const start = Date.now();
    await throttleHost(host, 0);
    await throttleHost(host, 0);
    await throttleHost(host, 0);
    expect(Date.now() - start).toBeLessThan(100);
  });
});
