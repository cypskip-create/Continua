import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/continua_test";
process.env.LOG_LEVEL ??= "fatal";

const { withRetry } = await import("../../../src/crawler/retry.js");

describe("withRetry", () => {
  it("retries transient failures and succeeds once the underlying function succeeds", async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts++;
        if (attempts < 3) throw new Error(`transient failure ${attempts}`);
        return "success";
      },
      { maxRetries: 5, baseDelayMs: 5 },
    );
    expect(result).toBe("success");
    expect(attempts).toBe(3);
  });

  it("throws the last error after exhausting maxRetries", async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts++;
          throw new Error("always fails");
        },
        { maxRetries: 2, baseDelayMs: 5 },
      ),
    ).rejects.toThrow("always fails");
    expect(attempts).toBe(3); // initial attempt + 2 retries
  });

  it("stops immediately without retrying when isRetryable returns false", async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts++;
          throw new Error("permanent failure");
        },
        { maxRetries: 5, baseDelayMs: 5, isRetryable: () => false },
      ),
    ).rejects.toThrow("permanent failure");
    expect(attempts).toBe(1);
  });

  it("succeeds on the first attempt without any delay when there's no failure", async () => {
    let attempts = 0;
    const start = Date.now();
    const result = await withRetry(async () => { attempts++; return "immediate"; }, { maxRetries: 5, baseDelayMs: 1000 });
    expect(result).toBe("immediate");
    expect(attempts).toBe(1);
    expect(Date.now() - start).toBeLessThan(100);
  });
});
